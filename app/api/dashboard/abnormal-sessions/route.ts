import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

function bangkokDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: unknown, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(numberValue(value) * factor) / factor;
}

function bangkokDay(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type RecoveryStatus = "recovered_5m" | "recovered_30m" | "recovered_same_day" | "recovered_later" | "no_recovery_observed";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const from = bangkokDate(params.get("from")) ?? new Date(Date.now() - 30 * 86400000);
  const to = bangkokDate(params.get("to"), true) ?? new Date();
  const requestedLimit = Number(params.get("limit") ?? 500);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 500;
  if (from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT
        cs.id,
        cs.charger_id,
        cs.connector_id,
        cs.start_at,
        cs.end_at,
        cs.duration_seconds,
        cs.charging_amount_kwh,
        cs.stop_reason_raw,
        cs.reason_category,
        COALESCE(ci.display_mask, 'ไม่ระบุ') AS customer_mask,
        COALESCE(ch.source_name, ch.serial_number) AS charger_name,
        COALESCE(co.source_name, co.connector_no::text) AS connector_name,
        recovery.start_at AS recovery_at,
        recovery.end_at AS recovery_end_at,
        recovery.duration_seconds AS recovery_duration_seconds,
        recovery.charging_amount_kwh AS recovery_kwh,
        recovery.stop_reason_raw AS recovery_stop_reason_raw,
        recovery.reason_category AS recovery_reason_category,
        recovery.charger_name AS recovery_charger_name,
        recovery.connector_name AS recovery_connector_name,
        recovery.charger_id AS recovery_charger_id,
        recovery.connector_id AS recovery_connector_id,
        retries.retry_count,
        retention.successful_7d,
        retention.successful_30d,
        alarms.alarm_count,
        alarms.alarm_summary
      FROM charging_sessions cs
      JOIN stations s ON s.id = cs.station_id
      LEFT JOIN customer_identifiers ci ON ci.id = cs.customer_identifier_id
      LEFT JOIN chargers ch ON ch.id = cs.charger_id
      LEFT JOIN connectors co ON co.id = cs.connector_id
      LEFT JOIN LATERAL (
        SELECT
          ns.start_at,
          ns.end_at,
          ns.duration_seconds,
          ns.charging_amount_kwh,
          ns.stop_reason_raw,
          ns.reason_category,
          ns.charger_id,
          ns.connector_id,
          COALESCE(next_charger.source_name, next_charger.serial_number) AS charger_name,
          COALESCE(next_connector.source_name, next_connector.connector_no::text) AS connector_name
        FROM charging_sessions ns
        JOIN stations next_station ON next_station.id = ns.station_id
        LEFT JOIN chargers next_charger ON next_charger.id = ns.charger_id
        LEFT JOIN connectors next_connector ON next_connector.id = ns.connector_id
        WHERE ns.customer_identifier_id = cs.customer_identifier_id
          AND ns.start_at >= COALESCE(cs.end_at, cs.start_at)
          AND ns.duration_seconds >= 60
          AND ns.charging_amount_kwh >= 1
          AND next_station.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
        ORDER BY ns.start_at
        LIMIT 1
      ) recovery ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS retry_count
        FROM charging_sessions retry_session
        JOIN stations retry_station ON retry_station.id = retry_session.station_id
        WHERE retry_session.customer_identifier_id = cs.customer_identifier_id
          AND retry_session.start_at >= COALESCE(cs.end_at, cs.start_at)
          AND (recovery.start_at IS NULL OR retry_session.start_at < recovery.start_at)
          AND (retry_session.duration_seconds < 60 OR retry_session.charging_amount_kwh < 1)
          AND retry_station.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
      ) retries ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE ns.start_at <= COALESCE(cs.end_at, cs.start_at) + INTERVAL '7 days')::int AS successful_7d,
          COUNT(*)::int AS successful_30d
        FROM charging_sessions ns
        JOIN stations retention_station ON retention_station.id = ns.station_id
        WHERE ns.customer_identifier_id = cs.customer_identifier_id
          AND ns.start_at > COALESCE(cs.end_at, cs.start_at)
          AND ns.start_at <= COALESCE(cs.end_at, cs.start_at) + INTERVAL '30 days'
          AND ns.duration_seconds >= 60
          AND ns.charging_amount_kwh >= 1
          AND retention_station.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
      ) retention ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS alarm_count,
          COALESCE(
            string_agg(DISTINCT concat_ws(' · ', ca.alarm_code::text, ca.alarm_reason_raw, ca.status), ' | '),
            ''
          ) AS alarm_summary
        FROM charger_alarms ca
        JOIN stations alarm_station ON alarm_station.id = ca.station_id
        WHERE ca.charger_id = cs.charger_id
          AND ca.start_at <= COALESCE(cs.end_at, cs.start_at)
          AND COALESCE(ca.end_at, ca.start_at) >= cs.start_at
          AND alarm_station.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
      ) alarms ON true
      WHERE s.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
        AND cs.start_at >= ${from} AND cs.start_at <= ${to}
        AND (cs.duration_seconds < 60 OR cs.charging_amount_kwh < 1)
      ORDER BY cs.start_at DESC
      LIMIT ${limit}
    `);

    const items = result.rows.map((row) => {
      const event = row as Record<string, unknown>;
      const recoveryAt = event.recovery_at ? String(event.recovery_at) : null;
      const endAt = String(event.end_at ?? event.start_at);
      const gapMinutes = recoveryAt ? Math.max(0, round((new Date(recoveryAt).getTime() - new Date(endAt).getTime()) / 60000)) : null;
      let recoveryStatus: RecoveryStatus = "no_recovery_observed";
      if (recoveryAt && gapMinutes !== null) {
        if (gapMinutes <= 5) recoveryStatus = "recovered_5m";
        else if (gapMinutes <= 30) recoveryStatus = "recovered_30m";
        else if (bangkokDay(recoveryAt) === bangkokDay(String(event.start_at))) recoveryStatus = "recovered_same_day";
        else recoveryStatus = "recovered_later";
      }
      return {
        id: String(event.id),
        startAt: String(event.start_at),
        endAt: event.end_at ? String(event.end_at) : null,
        customerMask: String(event.customer_mask),
        chargerName: String(event.charger_name),
        connectorName: String(event.connector_name),
        durationSeconds: numberValue(event.duration_seconds),
        energyKwh: round(event.charging_amount_kwh, 2),
        stopReason: event.stop_reason_raw ? String(event.stop_reason_raw) : null,
        reasonCategory: event.reason_category ? String(event.reason_category) : null,
        recoveryStatus,
        recoveryAt,
        recoveryEndAt: recoveryAt && event.recovery_end_at ? String(event.recovery_end_at) : null,
        recoveryGapMinutes: gapMinutes,
        recoveryDurationSeconds: recoveryAt ? numberValue(event.recovery_duration_seconds) : null,
        recoveryKwh: recoveryAt ? round(event.recovery_kwh, 2) : null,
        recoveryStopReason: recoveryAt && event.recovery_stop_reason_raw ? String(event.recovery_stop_reason_raw) : null,
        recoveryReasonCategory: recoveryAt && event.recovery_reason_category ? String(event.recovery_reason_category) : null,
        recoveryChargerName: recoveryAt && event.recovery_charger_name ? String(event.recovery_charger_name) : null,
        recoveryConnectorName: recoveryAt && event.recovery_connector_name ? String(event.recovery_connector_name) : null,
        recoveryPath: recoveryAt
          ? String(event.charger_id) === String(event.recovery_charger_id) && String(event.connector_id) === String(event.recovery_connector_id)
            ? "same_connector"
            : String(event.charger_id) === String(event.recovery_charger_id)
              ? "same_charger_other_connector"
              : "other_charger"
          : "no_recovery",
        retryLevel: numberValue(event.retry_count) >= 2 ? "multiple" : numberValue(event.retry_count) === 1 ? "once" : "none",
        successfulSessions7d: numberValue(event.successful_7d),
        successfulSessions30d: numberValue(event.successful_30d),
        returnedWithin7d: numberValue(event.successful_7d) > 0,
        returnedWithin30d: numberValue(event.successful_30d) > 0,
        retryCount: numberValue(event.retry_count),
        alarmCount: numberValue(event.alarm_count),
        alarmSummary: event.alarm_summary ? String(event.alarm_summary) : null,
      };
    });

    const summary = {
      total: items.length,
      recovered5m: items.filter((item) => item.recoveryStatus === "recovered_5m").length,
      recovered30m: items.filter((item) => item.recoveryStatus === "recovered_5m" || item.recoveryStatus === "recovered_30m").length,
      recoveredSameDay: items.filter((item) => item.recoveryStatus !== "no_recovery_observed" && item.recoveryStatus !== "recovered_later").length,
      noRecoveryObserved: items.filter((item) => item.recoveryStatus === "no_recovery_observed").length,
      withOverlappingAlarm: items.filter((item) => item.alarmCount > 0).length,
      sameConnectorRecovery: items.filter((item) => item.recoveryPath === "same_connector").length,
      sameChargerOtherConnector: items.filter((item) => item.recoveryPath === "same_charger_other_connector").length,
      otherChargerRecovery: items.filter((item) => item.recoveryPath === "other_charger").length,
      multipleRetry: items.filter((item) => item.retryLevel === "multiple").length,
      returnedWithin7d: items.filter((item) => item.returnedWithin7d).length,
      returnedWithin30d: items.filter((item) => item.returnedWithin30d).length,
    };

    return Response.json({ range: { from: from.toISOString(), to: to.toISOString() }, summary, items });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านรายละเอียดการชาร์จผิดปกติไม่สำเร็จ" }, { status: 500 });
  }
}

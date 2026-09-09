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

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const from = bangkokDate(params.get("from")) ?? new Date(Date.now() - 30 * 86400000);
  const to = bangkokDate(params.get("to"), true) ?? new Date();
  const requestedLimit = Number(params.get("limit") ?? 500);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 500;
  if (from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const result = await getDb().execute(sql`
      SELECT
        ca.id,
        ca.alarm_code,
        ca.alarm_reason_raw,
        ca.start_at,
        ca.end_at,
        ca.duration_seconds,
        ca.status,
        COALESCE(ch.source_name, ch.serial_number) AS charger_name,
        COALESCE(co.source_name, co.connector_no::text, 'ทุกหัวชาร์จ') AS connector_name,
        impacted.session_count,
        impacted.short_session_count,
        next_session.start_at AS next_session_at,
        next_session.end_at AS next_session_end_at,
        next_session.duration_seconds AS next_session_duration_seconds,
        next_session.charging_amount_kwh AS next_session_kwh,
        next_session.stop_reason_raw AS next_session_stop_reason
      FROM charger_alarms ca
      JOIN stations s ON s.id = ca.station_id
      LEFT JOIN chargers ch ON ch.id = ca.charger_id
      LEFT JOIN connectors co ON co.id = ca.connector_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS session_count,
          COUNT(*) FILTER (WHERE cs.duration_seconds < 60 OR cs.charging_amount_kwh < 1)::int AS short_session_count
        FROM charging_sessions cs
        WHERE cs.charger_id = ca.charger_id
          AND (ca.connector_id IS NULL OR cs.connector_id = ca.connector_id)
          AND cs.start_at <= COALESCE(ca.end_at, NOW())
          AND COALESCE(cs.end_at, cs.start_at) >= ca.start_at
      ) impacted ON true
      LEFT JOIN LATERAL (
        SELECT cs.start_at, cs.end_at, cs.duration_seconds, cs.charging_amount_kwh, cs.stop_reason_raw
        FROM charging_sessions cs
        WHERE cs.charger_id = ca.charger_id
          AND (ca.connector_id IS NULL OR cs.connector_id = ca.connector_id)
          AND cs.start_at >= COALESCE(ca.end_at, ca.start_at)
        ORDER BY cs.start_at
        LIMIT 1
      ) next_session ON true
      WHERE s.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
        AND ca.start_at >= ${from} AND ca.start_at <= ${to}
      ORDER BY ca.start_at DESC
      LIMIT ${limit}
    `);

    const items = result.rows.map((row) => {
      const alarm = row as Record<string, unknown>;
      const durationSeconds = numberValue(alarm.duration_seconds);
      const status = String(alarm.status ?? "ไม่ระบุ");
      const sessionCount = numberValue(alarm.session_count);
      const shortSessionCount = numberValue(alarm.short_session_count);
      return {
        id: String(alarm.id),
        code: alarm.alarm_code === null || alarm.alarm_code === undefined ? "–" : String(alarm.alarm_code),
        reason: String(alarm.alarm_reason_raw ?? "ไม่ระบุสาเหตุ"),
        startAt: String(alarm.start_at),
        endAt: alarm.end_at ? String(alarm.end_at) : null,
        durationSeconds,
        status,
        chargerName: String(alarm.charger_name ?? "ไม่ระบุ"),
        connectorName: String(alarm.connector_name ?? "ทุกหัวชาร์จ"),
        impactedSessionCount: sessionCount,
        impactedShortSessionCount: shortSessionCount,
        nextSessionAt: alarm.next_session_at ? String(alarm.next_session_at) : null,
        nextSessionEndAt: alarm.next_session_end_at ? String(alarm.next_session_end_at) : null,
        nextSessionDurationSeconds: alarm.next_session_at ? numberValue(alarm.next_session_duration_seconds) : null,
        nextSessionKwh: alarm.next_session_at ? round(alarm.next_session_kwh, 2) : null,
        nextSessionStopReason: alarm.next_session_stop_reason ? String(alarm.next_session_stop_reason) : null,
      };
    });

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        total: items.length,
        recovered: items.filter((item) => item.status.toLowerCase() === "recovered").length,
        active: items.filter((item) => item.status.toLowerCase() !== "recovered" || !item.endAt).length,
        longerThan5Minutes: items.filter((item) => item.durationSeconds >= 300).length,
        overlappingSessions: items.filter((item) => item.impactedSessionCount > 0).length,
      },
      items,
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านรายละเอียด Alarm ไม่สำเร็จ" }, { status: 500 });
  }
}

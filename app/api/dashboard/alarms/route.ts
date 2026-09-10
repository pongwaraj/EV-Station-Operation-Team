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

const INCIDENT_GAP_SECONDS = 5 * 60;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function buildIncidents(items: Alarm[]) {
  const sorted = [...items].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
  const incidents: Array<Incident & { sessionIds: Set<string>; shortSessionIds: Set<string>; intervals: Array<[number, number]> }> = [];
  const openByKey = new Map<string, (typeof incidents)[number]>();

  for (const alarm of sorted) {
    const key = `${alarm.chargerName}|${alarm.connectorName}|${alarm.code}|${alarm.reason}`;
    const startMs = new Date(alarm.startAt).getTime();
    const endMs = alarm.endAt ? new Date(alarm.endAt).getTime() : Date.now();
    const previous = openByKey.get(key);
    const canJoin = previous && startMs <= previous.joinUntilMs;
    const incident = canJoin ? previous : {
      id: `incident-${alarm.id}`,
      code: alarm.code,
      reason: alarm.reason,
      chargerName: alarm.chargerName,
      connectorName: alarm.connectorName,
      startAt: alarm.startAt,
      endAt: alarm.endAt,
      status: alarm.status.toLowerCase() === "recovered" && alarm.endAt ? "Recovered" : "Open",
      alarmCount: 0,
      durationSeconds: 0,
      impactedSessionCount: 0,
      impactedShortSessionCount: 0,
      joinUntilMs: endMs + INCIDENT_GAP_SECONDS * 1000,
      sessionIds: new Set<string>(),
      shortSessionIds: new Set<string>(),
      intervals: [],
    };
    if (!canJoin) incidents.push(incident);
    incident.alarmCount += 1;
    incident.endAt = !incident.endAt || !alarm.endAt ? null : new Date(incident.endAt).getTime() >= new Date(alarm.endAt).getTime() ? incident.endAt : alarm.endAt;
    incident.status = incident.status === "Open" || alarm.status.toLowerCase() !== "recovered" || !alarm.endAt ? "Open" : "Recovered";
    incident.joinUntilMs = Math.max(incident.joinUntilMs, endMs + INCIDENT_GAP_SECONDS * 1000);
    incident.intervals.push([startMs, endMs]);
    alarm.impactedSessionIds.forEach((id) => incident.sessionIds.add(id));
    alarm.impactedShortSessionIds.forEach((id) => incident.shortSessionIds.add(id));
    openByKey.set(key, incident);
  }

  return incidents.map((incident) => {
    const intervals = [...incident.intervals].sort((left, right) => left[0] - right[0]);
    let unionSeconds = 0;
    let unionStart = intervals[0]?.[0] ?? 0;
    let unionEnd = intervals[0]?.[1] ?? unionStart;
    for (const [start, end] of intervals.slice(1)) {
      if (start <= unionEnd) unionEnd = Math.max(unionEnd, end);
      else {
        unionSeconds += Math.max(0, unionEnd - unionStart) / 1000;
        unionStart = start;
        unionEnd = end;
      }
    }
    unionSeconds += Math.max(0, unionEnd - unionStart) / 1000;
    return {
      id: incident.id,
      code: incident.code,
      reason: incident.reason,
      chargerName: incident.chargerName,
      connectorName: incident.connectorName,
      startAt: incident.startAt,
      endAt: incident.endAt,
      status: incident.status,
      alarmCount: incident.alarmCount,
      durationSeconds: Math.round(unionSeconds),
      impactedSessionCount: incident.sessionIds.size,
      impactedShortSessionCount: incident.shortSessionIds.size,
    };
  });
}

type Alarm = {
  id: string;
  code: string;
  reason: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number;
  status: string;
  chargerName: string;
  connectorName: string;
  impactedSessionCount: number;
  impactedShortSessionCount: number;
  impactedSessionIds: string[];
  impactedShortSessionIds: string[];
  nextSessionAt: string | null;
  nextSessionEndAt: string | null;
  nextSessionDurationSeconds: number | null;
  nextSessionKwh: number | null;
  nextSessionStopReason: string | null;
};

type Incident = {
  id: string;
  code: string;
  reason: string;
  chargerName: string;
  connectorName: string;
  startAt: string;
  endAt: string | null;
  status: string;
  alarmCount: number;
  durationSeconds: number;
  impactedSessionCount: number;
  impactedShortSessionCount: number;
  joinUntilMs: number;
};

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
        impacted.session_ids,
        impacted.short_session_ids,
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
          COUNT(*) FILTER (WHERE cs.duration_seconds < 60 OR cs.charging_amount_kwh < 1)::int AS short_session_count,
          ARRAY_AGG(DISTINCT cs.id::text) AS session_ids,
          ARRAY_AGG(DISTINCT cs.id::text) FILTER (WHERE cs.duration_seconds < 60 OR cs.charging_amount_kwh < 1) AS short_session_ids
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
        impactedSessionIds: stringArray(alarm.session_ids),
        impactedShortSessionIds: stringArray(alarm.short_session_ids),
        nextSessionAt: alarm.next_session_at ? String(alarm.next_session_at) : null,
        nextSessionEndAt: alarm.next_session_end_at ? String(alarm.next_session_end_at) : null,
        nextSessionDurationSeconds: alarm.next_session_at ? numberValue(alarm.next_session_duration_seconds) : null,
        nextSessionKwh: alarm.next_session_at ? round(alarm.next_session_kwh, 2) : null,
        nextSessionStopReason: alarm.next_session_stop_reason ? String(alarm.next_session_stop_reason) : null,
      };
    });

    const incidents = buildIncidents(items);
    const causeMap = new Map<string, { code: string; reason: string; incidentCount: number; alarmRecordCount: number; durationSeconds: number; impactedSessions: number; devices: Set<string>; activeIncidents: number }>();
    incidents.forEach((incident) => {
      const key = `${incident.code}|${incident.reason}`;
      const cause = causeMap.get(key) ?? { code: incident.code, reason: incident.reason, incidentCount: 0, alarmRecordCount: 0, durationSeconds: 0, impactedSessions: 0, devices: new Set<string>(), activeIncidents: 0 };
      cause.incidentCount += 1;
      cause.alarmRecordCount += incident.alarmCount;
      cause.durationSeconds += incident.durationSeconds;
      cause.impactedSessions += incident.impactedSessionCount;
      cause.devices.add(`${incident.chargerName}|${incident.connectorName}`);
      if (incident.status === "Open") cause.activeIncidents += 1;
      causeMap.set(key, cause);
    });
    const topCauses = [...causeMap.values()]
      .sort((left, right) => right.incidentCount - left.incidentCount || right.durationSeconds - left.durationSeconds)
      .slice(0, 5)
      .map((cause) => ({
        code: cause.code,
        reason: cause.reason,
        incidentCount: cause.incidentCount,
        alarmRecordCount: cause.alarmRecordCount,
        durationSeconds: cause.durationSeconds,
        impactedSessions: cause.impactedSessions,
        deviceCount: cause.devices.size,
        activeIncidents: cause.activeIncidents,
      }));

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        total: items.length,
        incidents: incidents.length,
        recovered: items.filter((item) => item.status.toLowerCase() === "recovered").length,
        active: items.filter((item) => item.status.toLowerCase() !== "recovered" || !item.endAt).length,
        openIncidents: incidents.filter((incident) => incident.status === "Open").length,
        longerThan5Minutes: items.filter((item) => item.durationSeconds >= 300).length,
        overlappingSessions: items.filter((item) => item.impactedSessionCount > 0).length,
        impactedSessions: new Set(items.flatMap((item) => item.impactedSessionIds)).size,
        incidentDurationMinutes: round(incidents.reduce((sum, incident) => sum + incident.durationSeconds, 0) / 60),
      },
      topCauses,
      incidents,
      items,
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านรายละเอียด Alarm ไม่สำเร็จ" }, { status: 500 });
  }
}

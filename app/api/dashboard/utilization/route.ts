import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

type AssetRow = {
  charger_id: string;
  charger_name: string | null;
  charger_number: string | null;
  charger_status: string | null;
  power_kw: number | string | null;
  connector_id: string | null;
  connector_name: string | null;
  connector_no: number | string | null;
};

type UsageRow = {
  charger_id: string;
  connector_id: string;
  session_count: number | string | null;
  occupied_seconds: number | string | null;
  energy_kwh: number | string | null;
};

type TrendRow = {
  date: string;
  session_count: number | string | null;
  occupied_seconds: number | string | null;
  energy_kwh: number | string | null;
};

type StatusEventRow = {
  charger_id: string;
  connector_id: string | null;
  observed_at: string | Date;
  status: string | null;
};

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

function statusGroup(value: string | null): "online" | "offline" | "unknown" {
  const status = String(value ?? "").toLowerCase();
  if (!status) return "unknown";
  if (/offline|fault|error|down|unavailable/.test(status)) return "offline";
  if (/online|available|normal|running|charging|idle|available/.test(status)) return "online";
  return "unknown";
}

function displayAssetName(row: AssetRow) {
  return row.charger_name || row.charger_number || row.charger_id.slice(0, 8);
}

function displayConnectorName(row: AssetRow) {
  return row.connector_name || (row.connector_no ? `หัว ${row.connector_no}` : "ไม่ระบุหัว");
}

function metric(occupiedSeconds: number, capacityHours: number) {
  const occupiedHours = occupiedSeconds / 3600;
  const rawUtilization = capacityHours > 0 ? (occupiedHours / capacityHours) * 100 : 0;
  const utilization = Math.min(100, Math.max(0, rawUtilization));
  return {
    occupiedHours: round(occupiedHours, 2),
    capacityHours: round(capacityHours, 2),
    headroomHours: round(Math.max(0, capacityHours - occupiedHours), 2),
    utilization: round(utilization, 1),
    headroom: round(Math.max(0, 100 - utilization), 1),
    overlapDetected: rawUtilization > 100.1,
  };
}

function availabilityMetric(events: StatusEventRow[], chargerId: string, connectorId: string, fromMs: number, toMs: number) {
  const connectorEvents = events.filter((event) => event.connector_id === connectorId);
  const chargerEvents = events.filter((event) => event.charger_id === chargerId && !event.connector_id);
  const selected = (connectorEvents.length ? connectorEvents : chargerEvents).sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
  if (!selected.length) return null;

  let cursor = fromMs;
  let currentStatus: "online" | "offline" | "unknown" | null = null;
  let knownSeconds = 0;
  let availableSeconds = 0;
  for (const event of selected) {
    const observedMs = new Date(event.observed_at).getTime();
    if (!Number.isFinite(observedMs)) continue;
    if (observedMs <= fromMs) {
      currentStatus = statusGroup(event.status);
      continue;
    }
    if (observedMs >= toMs) break;
    if (currentStatus && observedMs > cursor) {
      const seconds = (observedMs - cursor) / 1000;
      if (currentStatus !== "unknown") knownSeconds += seconds;
      if (currentStatus === "online") availableSeconds += seconds;
    }
    cursor = observedMs;
    currentStatus = statusGroup(event.status);
  }
  if (currentStatus && toMs > cursor) {
    const seconds = (toMs - cursor) / 1000;
    if (currentStatus !== "unknown") knownSeconds += seconds;
    if (currentStatus === "online") availableSeconds += seconds;
  }

  return {
    knownSeconds,
    availableSeconds,
    coverage: toMs > fromMs ? (knownSeconds / ((toMs - fromMs) / 1000)) * 100 : 0,
    uptime: knownSeconds > 0 ? (availableSeconds / knownSeconds) * 100 : null,
  };
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const from = bangkokDate(params.get("from")) ?? new Date(Date.now() - 29 * 86400000);
  const to = bangkokDate(params.get("to"), true) ?? new Date();
  if (from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = getDb();
    const [assetsResult, usageResult, trendResult, statusResult] = await Promise.all([
      db.execute(sql`
        SELECT
          ch.id::text AS charger_id,
          ch.source_name AS charger_name,
          ch.charger_number,
          ch.status AS charger_status,
          ch.power_kw,
          co.id::text AS connector_id,
          co.source_name AS connector_name,
          co.connector_no
        FROM stations s
        JOIN chargers ch ON ch.station_id = s.id
        LEFT JOIN connectors co ON co.charger_id = ch.id
        WHERE (s.canonical_name = 'tce ev station @meta mall'
           OR (s.canonical_name = 'สถานีชาร์จ เมต้า มอลล์' AND NOT EXISTS (SELECT 1 FROM stations primary_station WHERE primary_station.canonical_name = 'tce ev station @meta mall')))
        ORDER BY ch.source_name NULLS LAST, ch.charger_number NULLS LAST, co.connector_no NULLS LAST
      `),
      db.execute(sql`
        SELECT
          cs.charger_id::text AS charger_id,
          cs.connector_id::text AS connector_id,
          COUNT(*)::int AS session_count,
          COALESCE(SUM(EXTRACT(EPOCH FROM (
            LEAST(COALESCE(cs.end_at, cs.start_at + COALESCE(cs.duration_seconds, 0) * interval '1 second'), ${to})
            - GREATEST(cs.start_at, ${from})
          ))), 0)::numeric AS occupied_seconds,
          COALESCE(SUM(cs.charging_amount_kwh), 0)::numeric AS energy_kwh
        FROM charging_sessions cs
        JOIN stations s ON s.id = cs.station_id
        WHERE (s.canonical_name = 'tce ev station @meta mall'
           OR (s.canonical_name = 'สถานีชาร์จ เมต้า มอลล์' AND NOT EXISTS (SELECT 1 FROM stations primary_station WHERE primary_station.canonical_name = 'tce ev station @meta mall')))
          AND cs.start_at < ${to}
          AND COALESCE(cs.end_at, cs.start_at + COALESCE(cs.duration_seconds, 0) * interval '1 second') > ${from}
        GROUP BY cs.charger_id, cs.connector_id
      `),
      db.execute(sql`
        SELECT
          (cs.start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS date,
          COUNT(*)::int AS session_count,
          COALESCE(SUM(EXTRACT(EPOCH FROM (
            LEAST(COALESCE(cs.end_at, cs.start_at + COALESCE(cs.duration_seconds, 0) * interval '1 second'), ${to})
            - GREATEST(cs.start_at, ${from})
          ))), 0)::numeric AS occupied_seconds,
          COALESCE(SUM(cs.charging_amount_kwh), 0)::numeric AS energy_kwh
        FROM charging_sessions cs
        JOIN stations s ON s.id = cs.station_id
        WHERE (s.canonical_name = 'tce ev station @meta mall'
           OR (s.canonical_name = 'สถานีชาร์จ เมต้า มอลล์' AND NOT EXISTS (SELECT 1 FROM stations primary_station WHERE primary_station.canonical_name = 'tce ev station @meta mall')))
          AND cs.start_at < ${to}
          AND COALESCE(cs.end_at, cs.start_at + COALESCE(cs.duration_seconds, 0) * interval '1 second') > ${from}
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute(sql`
        WITH seed AS (
          SELECT DISTINCT ON (COALESCE(se.connector_id, se.charger_id))
            se.charger_id::text AS charger_id,
            se.connector_id::text AS connector_id,
            se.observed_at,
            se.status
          FROM status_events se
          JOIN stations s ON s.id = se.station_id
          WHERE (s.canonical_name = 'tce ev station @meta mall'
             OR (s.canonical_name = 'สถานีชาร์จ เมต้า มอลล์' AND NOT EXISTS (SELECT 1 FROM stations primary_station WHERE primary_station.canonical_name = 'tce ev station @meta mall')))
            AND se.observed_at <= ${from}
          ORDER BY COALESCE(se.connector_id, se.charger_id), se.observed_at DESC
        ),
        period AS (
          SELECT
            se.charger_id::text AS charger_id,
            se.connector_id::text AS connector_id,
            se.observed_at,
            se.status
          FROM status_events se
          JOIN stations s ON s.id = se.station_id
          WHERE (s.canonical_name = 'tce ev station @meta mall'
             OR (s.canonical_name = 'สถานีชาร์จ เมต้า มอลล์' AND NOT EXISTS (SELECT 1 FROM stations primary_station WHERE primary_station.canonical_name = 'tce ev station @meta mall')))
            AND se.observed_at > ${from}
            AND se.observed_at < ${to}
        )
        SELECT charger_id, connector_id, observed_at, status FROM seed
        UNION ALL
        SELECT charger_id, connector_id, observed_at, status FROM period
        ORDER BY observed_at
      `),
    ]);

    const assets = assetsResult.rows as unknown as AssetRow[];
    const usage = usageResult.rows as unknown as UsageRow[];
    const trends = trendResult.rows as unknown as TrendRow[];
    const statusEvents = statusResult.rows as unknown as StatusEventRow[];
    const connectorAssets = assets.filter((row) => row.connector_id);
    const chargerIds = [...new Set(assets.map((row) => row.charger_id))];
    const connectorCount = connectorAssets.length;
    const periodHours = Math.max(0, (to.getTime() - from.getTime()) / 3600000);
    const capacityHours = connectorCount * periodHours;
    const usageByConnector = new Map(usage.map((row) => [row.connector_id, row]));

    const connectorRows = connectorAssets.map((asset) => {
      const row = usageByConnector.get(asset.connector_id as string);
      const occupiedSeconds = numberValue(row?.occupied_seconds);
      const availability = availabilityMetric(statusEvents, asset.charger_id, asset.connector_id as string, from.getTime(), to.getTime());
      const availabilityCapacityHours = availability ? availability.availableSeconds / 3600 : 0;
      return {
        id: asset.connector_id,
        chargerId: asset.charger_id,
        chargerName: displayAssetName(asset),
        connectorName: displayConnectorName(asset),
        connectorNo: numberValue(asset.connector_no),
        status: asset.charger_status || "ไม่ระบุ",
        statusGroup: statusGroup(asset.charger_status),
        powerKw: round(asset.power_kw, 1),
        sessions: numberValue(row?.session_count),
        energyKwh: round(row?.energy_kwh, 1),
        availability: availability ? {
          availableHours: round(availabilityCapacityHours, 2),
          coverageHours: round(availability.knownSeconds / 3600, 2),
          coverage: round(availability.coverage, 1),
          uptime: availability.uptime === null ? null : round(availability.uptime, 1),
          utilization: metric(occupiedSeconds, availabilityCapacityHours).utilization,
          headroom: metric(occupiedSeconds, availabilityCapacityHours).headroom,
        } : null,
        ...metric(occupiedSeconds, periodHours),
      };
    });

    const chargerRows = chargerIds.map((chargerId) => {
      const rows = connectorRows.filter((row) => row.chargerId === chargerId);
      const firstAsset = assets.find((asset) => asset.charger_id === chargerId) as AssetRow;
      const occupiedSeconds = rows.reduce((sum, row) => sum + row.occupiedHours * 3600, 0);
      const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
      const energyKwh = rows.reduce((sum, row) => sum + row.energyKwh, 0);
      const availabilityKnownSeconds = rows.reduce((sum, row) => sum + (row.availability?.coverageHours ?? 0) * 3600, 0);
      const availabilityCapacityHours = rows.reduce((sum, row) => sum + (row.availability?.availableHours ?? 0), 0);
      return {
        id: chargerId,
        name: displayAssetName(firstAsset),
        status: firstAsset.charger_status || "ไม่ระบุ",
        statusGroup: statusGroup(firstAsset.charger_status),
        powerKw: round(firstAsset.power_kw, 1),
        connectorCount: rows.length,
        sessions,
        energyKwh: round(energyKwh, 1),
        availability: availabilityKnownSeconds > 0 ? {
          availableHours: round(availabilityCapacityHours, 2),
          coverageHours: round(availabilityKnownSeconds / 3600, 2),
          coverage: round((availabilityKnownSeconds / (rows.length * periodHours * 3600)) * 100, 1),
          uptime: availabilityKnownSeconds > 0 ? round((availabilityCapacityHours / (availabilityKnownSeconds / 3600)) * 100, 1) : null,
          utilization: metric(occupiedSeconds, availabilityCapacityHours).utilization,
          headroom: metric(occupiedSeconds, availabilityCapacityHours).headroom,
        } : null,
        ...metric(occupiedSeconds, rows.length * periodHours),
      };
    });

    const stationOccupiedSeconds = connectorRows.reduce((sum, row) => sum + row.occupiedHours * 3600, 0);
    const stationSessions = connectorRows.reduce((sum, row) => sum + row.sessions, 0);
    const stationEnergyKwh = connectorRows.reduce((sum, row) => sum + row.energyKwh, 0);
    const statusCounts = connectorRows.reduce((summary, row) => {
      summary[row.statusGroup] += 1;
      return summary;
    }, { online: 0, offline: 0, unknown: 0 } as Record<"online" | "offline" | "unknown", number>);
    const knownAvailabilitySeconds = connectorRows.reduce((sum, row) => sum + (row.availability?.coverageHours ?? 0) * 3600, 0);
    const availableCapacityHours = connectorRows.reduce((sum, row) => sum + (row.availability?.availableHours ?? 0), 0);
    const availability = knownAvailabilitySeconds > 0 ? {
      availableHours: round(availableCapacityHours, 2),
      coverageHours: round(knownAvailabilitySeconds / 3600, 2),
      coverage: round((knownAvailabilitySeconds / (connectorCount * periodHours * 3600)) * 100, 1),
      uptime: round((availableCapacityHours / (knownAvailabilitySeconds / 3600)) * 100, 1),
      utilization: metric(stationOccupiedSeconds, availableCapacityHours).utilization,
      headroom: metric(stationOccupiedSeconds, availableCapacityHours).headroom,
    } : null;

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      definition: {
        utilization: "Calendar utilization = เวลาที่หัวชาร์จถูกใช้งานจริง ÷ capacity ตามจำนวนหัวชาร์จ × ชั่วโมงในช่วงที่เลือก",
        headroom: "Calendar headroom = 100% - Calendar utilization; ถ้ามี status event จะมี Available-time headroom เพิ่มเติม",
        capacity: "Calendar capacity นับจากจำนวนหัวชาร์จใน master data × ชั่วโมงในช่วงที่เลือก",
        limitation: statusEvents.length > 0 ? "Available-time utilization ใช้ status event ที่นำเข้า; ช่วงที่ไม่มีสถานะจะไม่ถูกนับเป็นเวลาพร้อมให้บริการ" : "ยังไม่มี status event สำหรับคำนวณ uptime-adjusted utilization; สถานะ Online/Offline เป็นสถานะล่าสุดใน master data",
      },
      station: {
        name: "Meta Mall",
        chargerCount: chargerIds.length,
        connectorCount,
        statusCounts,
        sessions: stationSessions,
        energyKwh: round(stationEnergyKwh, 1),
        availability,
        ...metric(stationOccupiedSeconds, capacityHours),
      },
      chargers: chargerRows,
      connectors: connectorRows,
      trend: trends.map((row) => ({
        date: String(row.date),
        sessions: numberValue(row.session_count),
        energyKwh: round(row.energy_kwh, 1),
        ...metric(numberValue(row.occupied_seconds), connectorCount * 24),
      })),
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านข้อมูล utilization ไม่สำเร็จ" }, { status: 500 });
  }
}

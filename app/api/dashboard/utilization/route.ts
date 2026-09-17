import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

const STATION_NAMES = ["tce ev station @meta mall", "สถานีชาร์จ เมต้า มอลล์"];

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

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const from = bangkokDate(params.get("from")) ?? new Date(Date.now() - 29 * 86400000);
  const to = bangkokDate(params.get("to"), true) ?? new Date();
  if (from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = getDb();
    const [assetsResult, usageResult, trendResult] = await Promise.all([
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
        WHERE s.canonical_name IN (${sql.join(STATION_NAMES.map((name) => sql`${name}`), sql`, `)})
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
        WHERE s.canonical_name IN (${sql.join(STATION_NAMES.map((name) => sql`${name}`), sql`, `)})
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
        WHERE s.canonical_name IN (${sql.join(STATION_NAMES.map((name) => sql`${name}`), sql`, `)})
          AND cs.start_at < ${to}
          AND COALESCE(cs.end_at, cs.start_at + COALESCE(cs.duration_seconds, 0) * interval '1 second') > ${from}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const assets = assetsResult.rows as unknown as AssetRow[];
    const usage = usageResult.rows as unknown as UsageRow[];
    const trends = trendResult.rows as unknown as TrendRow[];
    const connectorAssets = assets.filter((row) => row.connector_id);
    const chargerIds = [...new Set(assets.map((row) => row.charger_id))];
    const connectorCount = connectorAssets.length;
    const periodHours = Math.max(0, (to.getTime() - from.getTime()) / 3600000);
    const capacityHours = connectorCount * periodHours;
    const usageByConnector = new Map(usage.map((row) => [row.connector_id, row]));

    const connectorRows = connectorAssets.map((asset) => {
      const row = usageByConnector.get(asset.connector_id as string);
      const occupiedSeconds = numberValue(row?.occupied_seconds);
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
        ...metric(occupiedSeconds, periodHours),
      };
    });

    const chargerRows = chargerIds.map((chargerId) => {
      const rows = connectorRows.filter((row) => row.chargerId === chargerId);
      const firstAsset = assets.find((asset) => asset.charger_id === chargerId) as AssetRow;
      const occupiedSeconds = rows.reduce((sum, row) => sum + row.occupiedHours * 3600, 0);
      const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
      const energyKwh = rows.reduce((sum, row) => sum + row.energyKwh, 0);
      return {
        id: chargerId,
        name: displayAssetName(firstAsset),
        status: firstAsset.charger_status || "ไม่ระบุ",
        statusGroup: statusGroup(firstAsset.charger_status),
        powerKw: round(firstAsset.power_kw, 1),
        connectorCount: rows.length,
        sessions,
        energyKwh: round(energyKwh, 1),
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

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      definition: {
        utilization: "เวลาที่หัวชาร์จถูกใช้งานจริง ÷ เวลาความสามารถให้บริการของหัวชาร์จทั้งหมด",
        headroom: "100% - utilization ของช่วงเวลาที่เลือก",
        capacity: "นับจากจำนวนหัวชาร์จที่มีใน master data × ชั่วโมงในช่วงที่เลือก",
        limitation: "ยังไม่ใช่ real-time availability; สถานะ Online/Offline เป็นสถานะล่าสุดที่มีใน master data",
      },
      station: {
        name: "Meta Mall",
        chargerCount: chargerIds.length,
        connectorCount,
        statusCounts,
        sessions: stationSessions,
        energyKwh: round(stationEnergyKwh, 1),
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

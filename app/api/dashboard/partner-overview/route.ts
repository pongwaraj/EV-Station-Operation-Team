import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

const DEFAULT_FROM = "2026-05-18";
const DEFAULT_TO = "2026-09-17";

function bangkokDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: unknown, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(numberValue(value) * factor) / factor;
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const fromValue = params.get("from") ?? DEFAULT_FROM;
  const toValue = params.get("to") ?? DEFAULT_TO;
  const from = bangkokDate(fromValue);
  const to = bangkokDate(toValue, true);
  if (!from || !to || from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = getDb();
    const [kpiResult, trendResult, importResult] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*)::int AS sessions,
          COUNT(*) FILTER (WHERE duration_seconds >= 300 AND charging_amount_kwh >= 1)::int AS meaningful_sessions,
          COUNT(DISTINCT customer_identifier_id)::int AS unique_customers,
          COALESCE(SUM(charging_amount_kwh), 0)::numeric AS energy_kwh,
          COALESCE(AVG(duration_seconds), 0)::numeric AS avg_duration_seconds,
          COUNT(*) FILTER (WHERE duration_seconds < 60 OR charging_amount_kwh < 1)::int AS short_sessions
        FROM charging_sessions cs
        JOIN stations s ON s.id = cs.station_id
        WHERE s.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
          AND cs.start_at >= ${from} AND cs.start_at <= ${to}
      `),
      db.execute(sql`
        SELECT
          (cs.start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS date,
          COUNT(*)::int AS sessions,
          COALESCE(SUM(cs.charging_amount_kwh), 0)::numeric AS energy_kwh
        FROM charging_sessions cs
        JOIN stations s ON s.id = cs.station_id
        WHERE s.canonical_name IN ('tce ev station @meta mall', 'สถานีชาร์จ เมต้า มอลล์')
          AND cs.start_at >= ${from} AND cs.start_at <= ${to}
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute(sql`SELECT MAX(completed_at) AS last_import_at FROM data_imports WHERE status IN ('completed', 'completed_with_warnings')`),
    ]);

    const kpi = (kpiResult.rows[0] ?? {}) as Record<string, unknown>;
    const energyKwh = round(kpi.energy_kwh);
    const sessions = numberValue(kpi.sessions);
    const trend = trendResult.rows.map((row) => {
      const item = row as Record<string, unknown>;
      const energy = round(item.energy_kwh);
      return { date: String(item.date), sessions: numberValue(item.sessions), energyKwh: energy };
    });
    const lastImportAt = (importResult.rows[0] as Record<string, unknown> | undefined)?.last_import_at ?? null;

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      privacy: { scope: "partner_view", excluded: ["customer_id", "vehicle_identity", "order_no"] },
      kpis: {
        sessions,
        meaningfulSessions: numberValue(kpi.meaningful_sessions),
        uniqueCustomers: numberValue(kpi.unique_customers),
        energyKwh,
        averageKwhPerSession: round(sessions ? energyKwh / sessions : 0),
        averageDurationMinutes: round(numberValue(kpi.avg_duration_seconds) / 60, 1),
        shortSessions: numberValue(kpi.short_sessions),
        shortSessionRate: round(sessions ? (numberValue(kpi.short_sessions) / sessions) * 100 : 0, 1),
      },
      trend,
      imports: { lastImportAt },
      methodology: {
        energy: "รวม Charging Amount จาก Order List ที่อยู่ในช่วงวันที่เลือก",
        note: "ใช้เพื่อดูแนวโน้มการใช้งานและ customer behavior ของพื้นที่",
      },
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่าน Partner Overview ไม่สำเร็จ" }, { status: 500 });
  }
}

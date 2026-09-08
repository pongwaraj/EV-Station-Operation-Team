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

function round(value: unknown, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(numberValue(value) * factor) / factor;
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const from = bangkokDate(params.get("from")) ?? new Date(Date.now() - 30 * 86400000);
  const to = bangkokDate(params.get("to"), true) ?? new Date();
  if (from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = getDb();
    const [sessionKpi, billingKpi, alarmKpi, sessionTrend, billingTrend, alarmTrend, hourTrend, imports, quality] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*)::int AS sessions,
          COALESCE(SUM(charging_amount_kwh), 0)::numeric AS energy_kwh,
          COALESCE(AVG(duration_seconds), 0)::numeric AS avg_duration_seconds,
          COUNT(DISTINCT customer_identifier_id)::int AS unique_customers,
          COUNT(*) FILTER (WHERE duration_seconds < 60 OR charging_amount_kwh < 1)::int AS short_sessions
        FROM charging_sessions
        WHERE start_at >= ${from} AND start_at <= ${to}
      `),
      db.execute(sql`
        SELECT COALESCE(SUM(revenue_thb), 0)::numeric AS revenue_thb
        FROM billing_transactions
        WHERE service_date >= ${from} AND service_date <= ${to}
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int AS alarm_events,
          COALESCE(SUM(duration_seconds), 0)::int AS alarm_duration_seconds
        FROM charger_alarms
        WHERE start_at >= ${from} AND start_at <= ${to}
      `),
      db.execute(sql`
        SELECT (start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS date,
          COUNT(*)::int AS sessions,
          COALESCE(SUM(charging_amount_kwh), 0)::numeric AS energy_kwh
        FROM charging_sessions
        WHERE start_at >= ${from} AND start_at <= ${to}
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT (service_date AT TIME ZONE 'Asia/Bangkok')::date::text AS date,
          COALESCE(SUM(revenue_thb), 0)::numeric AS revenue_thb
        FROM billing_transactions
        WHERE service_date >= ${from} AND service_date <= ${to}
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT (start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS date,
          COUNT(*)::int AS alarm_events
        FROM charger_alarms
        WHERE start_at >= ${from} AND start_at <= ${to}
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT EXTRACT(HOUR FROM (start_at AT TIME ZONE 'Asia/Bangkok'))::int AS hour,
          COUNT(*)::int AS sessions,
          COALESCE(SUM(charging_amount_kwh), 0)::numeric AS energy_kwh
        FROM charging_sessions
        WHERE start_at >= ${from} AND start_at <= ${to}
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS imports,
          MAX(completed_at) AS last_import_at
        FROM data_imports
        WHERE status IN ('completed', 'completed_with_warnings')
      `),
      db.execute(sql`
        SELECT severity, COUNT(*)::int AS count
        FROM data_quality_issues
        WHERE created_at >= ${from} AND created_at <= ${to} AND resolved = false
        GROUP BY severity ORDER BY severity
      `),
    ]);

    const session = (sessionKpi.rows[0] ?? {}) as Record<string, unknown>;
    const billing = (billingKpi.rows[0] ?? {}) as Record<string, unknown>;
    const alarm = (alarmKpi.rows[0] ?? {}) as Record<string, unknown>;
    const billingByDate = new Map(billingTrend.rows.map((row) => [String(row.date), numberValue(row.revenue_thb)]));
    const alarmsByDate = new Map(alarmTrend.rows.map((row) => [String(row.date), numberValue(row.alarm_events)]));
    const trend = sessionTrend.rows.map((row) => ({
      date: String(row.date),
      sessions: numberValue(row.sessions),
      energyKwh: round(row.energy_kwh),
      revenueThb: round(billingByDate.get(String(row.date)) ?? 0),
      alarmEvents: numberValue(alarmsByDate.get(String(row.date)) ?? 0),
    }));

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        sessions: numberValue(session.sessions),
        energyKwh: round(session.energy_kwh),
        revenueThb: round(billing.revenue_thb),
        uniqueCustomers: numberValue(session.unique_customers),
        avgDurationMinutes: round(numberValue(session.avg_duration_seconds) / 60),
        shortSessions: numberValue(session.short_sessions),
        alarmEvents: numberValue(alarm.alarm_events),
        alarmDurationMinutes: round(numberValue(alarm.alarm_duration_seconds) / 60),
      },
      trend,
      peakHours: hourTrend.rows.map((row) => ({ hour: numberValue(row.hour), sessions: numberValue(row.sessions), energyKwh: round(row.energy_kwh) })),
      imports: { count: numberValue((imports.rows[0] as Record<string, unknown> | undefined)?.imports), lastImportAt: (imports.rows[0] as Record<string, unknown> | undefined)?.last_import_at ?? null },
      quality: quality.rows.map((row) => ({ severity: String(row.severity), count: numberValue(row.count) })),
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านข้อมูล dashboard ไม่สำเร็จ" }, { status: 500 });
  }
}

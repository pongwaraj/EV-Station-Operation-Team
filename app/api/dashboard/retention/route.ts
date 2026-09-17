import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";

type SessionRow = {
  customer_id: string | null;
  local_date: string;
  month: string;
  start_at: string | Date;
};

function bangkokDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function monthKeys(from: Date, to: Date) {
  const keys: string[] = [];
  const cursor = new Date(from.getTime() + 7 * 3600000);
  cursor.setUTCDate(1);
  const end = new Date(to.getTime() + 7 * 3600000);
  end.setUTCDate(1);
  while (cursor <= end) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function subtractLocalDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day - days));
  return result.toISOString().slice(0, 10);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const fromValue = params.get("from") ?? DEFAULT_FROM;
  const toValue = params.get("to") ?? DEFAULT_TO;
  const from = bangkokDate(fromValue);
  const to = bangkokDate(toValue, true);
  if (!from || !to || from >= to) return Response.json({ message: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT
        cs.customer_identifier_id::text AS customer_id,
        cs.start_at,
        (cs.start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS local_date,
        TO_CHAR(DATE_TRUNC('month', cs.start_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month
      FROM charging_sessions cs
      JOIN stations s ON s.id = cs.station_id
      WHERE s.canonical_name = 'tce ev station @meta mall'
        AND cs.start_at >= ${from}
        AND cs.start_at <= ${to}
      ORDER BY cs.start_at
    `);

    const rows = result.rows as unknown as SessionRow[];
    const knownRows = rows.filter((row) => row.customer_id);
    const observationEnd = to.getTime() - 7 * 86400000;
    const months = monthKeys(from, to);
    const monthly = months.map((month) => {
      const monthRows = knownRows.filter((row) => row.month === month);
      const byCustomer = new Map<string, SessionRow[]>();
      monthRows.forEach((row) => {
        const customerId = row.customer_id as string;
        const current = byCustomer.get(customerId) ?? [];
        current.push(row);
        byCustomer.set(customerId, current);
      });

      const repeatCustomers = [...byCustomer.values()].filter((customerRows) => customerRows.length >= 2);
      const oneTimeCustomers = [...byCustomer.values()].filter((customerRows) => customerRows.length === 1);
      let churnEligible = 0;
      let churned = 0;
      oneTimeCustomers.forEach(([firstSession]) => {
        const firstStart = new Date(firstSession.start_at).getTime();
        if (firstStart > observationEnd) return;
        churnEligible += 1;
        const returnedWithin7Days = knownRows.some((candidate) => {
          if (candidate.customer_id !== firstSession.customer_id) return false;
          const candidateStart = new Date(candidate.start_at).getTime();
          return candidateStart > firstStart && candidateStart <= firstStart + 7 * 86400000;
        });
        if (!returnedWithin7Days) churned += 1;
      });

      return {
        month,
        sessions: monthRows.length,
        uniqueCustomers: byCustomer.size,
        repeatCustomers: repeatCustomers.length,
        repeatRate: round(byCustomer.size ? (repeatCustomers.length / byCustomer.size) * 100 : 0),
        oneTimeCustomers: oneTimeCustomers.length,
        churnEligible,
        churned,
        churnRate: round(churnEligible ? (churned / churnEligible) * 100 : 0),
        churnPending: oneTimeCustomers.length - churnEligible,
      };
    });

    const churnEligible = monthly.reduce((sum, row) => sum + row.churnEligible, 0);
    const churned = monthly.reduce((sum, row) => sum + row.churned, 0);
    const maxRepeatCustomers = Math.max(...monthly.map((row) => row.repeatCustomers), 1);
    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      observationEnd: new Date(observationEnd).toISOString(),
      observationEndDate: subtractLocalDays(toValue, 7),
      methodology: {
        repeat: "ลูกค้าที่มีการชาร์จตั้งแต่ 2 ครั้งขึ้นไปภายในเดือนเดียวกัน",
        churn: "ลูกค้าที่ชาร์จครั้งเดียวในเดือน และไม่มีการชาร์จซ้ำภายใน 7 วันหลังครั้งแรก",
        customerKey: "customer_identifier_id จาก Card Number/User ID ของ Order List",
      },
      kpis: {
        sessions: rows.length,
        knownSessions: knownRows.length,
        unknownSessions: rows.length - knownRows.length,
        uniqueCustomers: new Set(knownRows.map((row) => row.customer_id)).size,
        averageRepeatCustomers: round(average(monthly.map((row) => row.repeatCustomers))),
        averageRepeatRate: round(average(monthly.map((row) => row.repeatRate))),
        churnRate: round(churnEligible ? (churned / churnEligible) * 100 : 0),
        churned,
        churnEligible,
        maxRepeatCustomers,
      },
      monthly,
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านข้อมูล retention ไม่สำเร็จ" }, { status: 500 });
  }
}

import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";
const LOOKBACK_DAYS = 60;
const REGULAR_SESSION_MIN_SECONDS = 300;
const REGULAR_SESSION_MIN_KWH = 1;
const REGULAR_MIN_SESSIONS = 3;
const REGULAR_MIN_WEEKS = 2;
const LAPSE_GRACE_DAYS = 7;

type SessionRow = {
  customer_id: string | null;
  local_date: string;
  month: string;
  start_at: string | Date;
  duration_seconds: number | string | null;
  energy_kwh: number | string | null;
};

type CustomerStatus = {
  customerId: string;
  rows: SessionRow[];
  lastDate: string;
  expectedGapDays: number;
  daysSinceLast: number;
  status: "active" | "at_risk" | "lapsed";
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
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

function parseLocalDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86400000));
}

function weekKey(localDate: string) {
  const date = parseLocalDate(localDate);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function isMeaningfulSession(row: SessionRow) {
  return Number(row.duration_seconds ?? 0) >= REGULAR_SESSION_MIN_SECONDS && Number(row.energy_kwh ?? 0) >= REGULAR_SESSION_MIN_KWH;
}

function qualifiesAsRegular(rows: SessionRow[]) {
  if (rows.length < REGULAR_MIN_SESSIONS) return false;
  for (const row of rows) {
    const end = parseLocalDate(row.local_date).getTime();
    const start = end - 30 * 86400000;
    const recent = rows.filter((candidate) => {
      const candidateTime = parseLocalDate(candidate.local_date).getTime();
      return candidateTime >= start && candidateTime <= end;
    });
    if (recent.length >= REGULAR_MIN_SESSIONS && new Set(recent.map((candidate) => weekKey(candidate.local_date))).size >= REGULAR_MIN_WEEKS) return true;
  }
  return false;
}

function expectedGapDays(rows: SessionRow[]) {
  const gaps: number[] = [];
  for (let index = 1; index < rows.length; index += 1) gaps.push(daysBetween(rows[index - 1].local_date, rows[index].local_date));
  return Math.max(1, round(median(gaps), 1));
}

function buildCustomerStatuses(rows: SessionRow[], toValue: string) {
  const byCustomer = new Map<string, SessionRow[]>();
  rows.forEach((row) => {
    if (!row.customer_id) return;
    const current = byCustomer.get(row.customer_id) ?? [];
    current.push(row);
    byCustomer.set(row.customer_id, current);
  });

  const statuses: CustomerStatus[] = [];
  byCustomer.forEach((customerRows, customerId) => {
    const sorted = [...customerRows].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    if (!qualifiesAsRegular(sorted)) return;
    const last = sorted[sorted.length - 1];
    const gap = expectedGapDays(sorted);
    const daysSinceLast = daysBetween(last.local_date, toValue);
    const status = daysSinceLast <= gap ? "active" : daysSinceLast <= gap + LAPSE_GRACE_DAYS ? "at_risk" : "lapsed";
    statuses.push({ customerId, rows: sorted, lastDate: last.local_date, expectedGapDays: gap, daysSinceLast, status });
  });
  return statuses;
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
    const lookbackFrom = new Date(from.getTime() - LOOKBACK_DAYS * 86400000);
    const result = await db.execute(sql`
      SELECT
        cs.customer_identifier_id::text AS customer_id,
        cs.start_at,
        (cs.start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS local_date,
        TO_CHAR(DATE_TRUNC('month', cs.start_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
        cs.duration_seconds,
        cs.charging_amount_kwh AS energy_kwh
      FROM charging_sessions cs
      JOIN stations s ON s.id = cs.station_id
      WHERE s.canonical_name = 'tce ev station @meta mall'
        AND cs.start_at >= ${lookbackFrom}
        AND cs.start_at <= ${to}
      ORDER BY cs.start_at
    `);

    const allRows = result.rows as unknown as SessionRow[];
    const knownRows = allRows.filter((row) => row.customer_id);
    const meaningfulRows = knownRows.filter(isMeaningfulSession);
    const reportRows = knownRows.filter((row) => new Date(row.start_at).getTime() >= from.getTime());
    const reportMeaningfulRows = meaningfulRows.filter((row) => new Date(row.start_at).getTime() >= from.getTime());
    const months = monthKeys(from, to);
    const firstMeaningfulByCustomer = new Map<string, SessionRow>();
    meaningfulRows.forEach((row) => {
      if (!row.customer_id) return;
      const first = firstMeaningfulByCustomer.get(row.customer_id);
      if (!first || new Date(row.start_at).getTime() < new Date(first.start_at).getTime()) firstMeaningfulByCustomer.set(row.customer_id, row);
    });

    const monthly = months.map((month) => {
      const monthRows = reportRows.filter((row) => row.month === month);
      const monthMeaningfulRows = reportMeaningfulRows.filter((row) => row.month === month);
      const byCustomer = new Map<string, SessionRow[]>();
      monthMeaningfulRows.forEach((row) => {
        const current = byCustomer.get(row.customer_id as string) ?? [];
        current.push(row);
        byCustomer.set(row.customer_id as string, current);
      });
      const repeatCustomers = [...byCustomer.values()].filter((customerRows) => customerRows.length >= 2).length;
      const regularCustomers = [...byCustomer.values()].filter((customerRows) => customerRows.length >= REGULAR_MIN_SESSIONS && new Set(customerRows.map((row) => weekKey(row.local_date))).size >= REGULAR_MIN_WEEKS).length;
      const newCustomers = [...byCustomer.keys()].filter((customerId) => firstMeaningfulByCustomer.get(customerId)?.month === month).length;
      return {
        month,
        sessions: monthRows.length,
        meaningfulSessions: monthMeaningfulRows.length,
        uniqueCustomers: new Set(monthRows.map((row) => row.customer_id)).size,
        newCustomers,
        returningCustomers: Math.max(0, byCustomer.size - newCustomers),
        repeatCustomers,
        repeatRate: round(byCustomer.size ? (repeatCustomers / byCustomer.size) * 100 : 0),
        regularCustomers,
        regularRate: round(byCustomer.size ? (regularCustomers / byCustomer.size) * 100 : 0),
      };
    });

    const statuses = buildCustomerStatuses(meaningfulRows, toValue);
    const activeRegularCustomers = statuses.filter((row) => row.status === "active").length;
    const atRiskRegularCustomers = statuses.filter((row) => row.status === "at_risk").length;
    const lapsedRegularCustomers = statuses.filter((row) => row.status === "lapsed").length;
    const cadenceValues = statuses.map((row) => row.expectedGapDays);
    const recent30DaySessions = statuses.map((status) => status.rows.filter((row) => daysBetween(row.local_date, toValue) <= 30).length);
    const cadenceBuckets = [
      { label: "≤ 7 วัน", count: statuses.filter((row) => row.expectedGapDays <= 7).length },
      { label: "8–14 วัน", count: statuses.filter((row) => row.expectedGapDays > 7 && row.expectedGapDays <= 14).length },
      { label: "15–30 วัน", count: statuses.filter((row) => row.expectedGapDays > 14 && row.expectedGapDays <= 30).length },
      { label: "> 30 วัน", count: statuses.filter((row) => row.expectedGapDays > 30).length },
    ];

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      observationEndDate: subtractLocalDays(toValue, 7),
      methodology: {
        repeat: "ลูกค้าที่มี meaningful session ตั้งแต่ 2 ครั้งขึ้นไปในเดือนเดียวกัน",
        regular: "มี meaningful session อย่างน้อย 3 ครั้งใน rolling 30 วัน และกระจายอย่างน้อย 2 สัปดาห์",
        lapse: "ลูกค้าประจำที่ห่างจากรอบชาร์จปกติของตนเองเกิน grace period 7 วัน",
        meaningfulSession: `Duration ≥ ${REGULAR_SESSION_MIN_SECONDS / 60} นาที และ Charging Amount ≥ ${REGULAR_SESSION_MIN_KWH} kWh เพื่อไม่นับ retry/รายการสั้นเป็นพฤติกรรมประจำ`,
        customerKey: "customer_identifier_id จาก Card Number/User ID ของ Order List",
      },
      kpis: {
        sessions: reportRows.length,
        meaningfulSessions: reportMeaningfulRows.length,
        unknownSessions: reportRows.filter((row) => !row.customer_id).length,
        uniqueCustomers: new Set(reportRows.map((row) => row.customer_id).filter(Boolean)).size,
        averageRepeatCustomers: round(average(monthly.map((row) => row.repeatCustomers))),
        averageRepeatRate: round(average(monthly.map((row) => row.repeatRate))),
        averageRegularCustomers: round(average(monthly.map((row) => row.regularCustomers))),
        activeRegularCustomers,
        atRiskRegularCustomers,
        lapsedRegularCustomers,
        regularLapseRate: round(statuses.length ? (lapsedRegularCustomers / statuses.length) * 100 : 0),
        medianExpectedGapDays: round(median(cadenceValues)),
        averageSessionsPer30Days: round(average(recent30DaySessions), 1),
        maxRegularCustomers: Math.max(...monthly.map((row) => row.regularCustomers), 1),
      },
      cadenceBuckets,
      monthly,
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านข้อมูล retention ไม่สำเร็จ" }, { status: 500 });
  }
}

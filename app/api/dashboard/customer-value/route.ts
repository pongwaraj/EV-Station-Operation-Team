import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";
const LOOKBACK_DAYS = 60;
const FLAT_RATE = 7.9;
const MEANINGFUL_MIN_SECONDS = 300;
const MEANINGFUL_MIN_KWH = 1;
const REGULAR_MIN_SESSIONS = 3;
const REGULAR_MIN_WEEKS = 2;
const LAPSE_GRACE_DAYS = 7;

type SessionRow = {
  customerId: string | null;
  localDate: string;
  month: string;
  startAt: string | Date;
  durationSeconds: number | string | null;
  energyKwh: number | string | null;
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

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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

function isMeaningful(row: SessionRow) {
  return numberValue(row.durationSeconds) >= MEANINGFUL_MIN_SECONDS && numberValue(row.energyKwh) >= MEANINGFUL_MIN_KWH;
}

function revenue(row: SessionRow) {
  return numberValue(row.energyKwh) * FLAT_RATE;
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

function qualifiesAsRegular(rows: SessionRow[]) {
  if (rows.length < REGULAR_MIN_SESSIONS) return false;
  for (const row of rows) {
    const end = parseLocalDate(row.localDate).getTime();
    const start = end - 30 * 86400000;
    const recent = rows.filter((candidate) => {
      const candidateTime = parseLocalDate(candidate.localDate).getTime();
      return candidateTime >= start && candidateTime <= end;
    });
    if (recent.length >= REGULAR_MIN_SESSIONS && new Set(recent.map((candidate) => weekKey(candidate.localDate))).size >= REGULAR_MIN_WEEKS) return true;
  }
  return false;
}

function expectedGapDays(rows: SessionRow[]) {
  const gaps: number[] = [];
  for (let index = 1; index < rows.length; index += 1) gaps.push(daysBetween(rows[index - 1].localDate, rows[index].localDate));
  return Math.max(1, round(median(gaps), 1));
}

function buildStatuses(rows: SessionRow[], toValue: string) {
  const byCustomer = new Map<string, SessionRow[]>();
  rows.forEach((row) => {
    if (!row.customerId) return;
    const current = byCustomer.get(row.customerId) ?? [];
    current.push(row);
    byCustomer.set(row.customerId, current);
  });

  const statuses: CustomerStatus[] = [];
  byCustomer.forEach((customerRows, customerId) => {
    const sorted = [...customerRows].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    if (!qualifiesAsRegular(sorted)) return;
    const lastDate = sorted[sorted.length - 1].localDate;
    const gap = expectedGapDays(sorted);
    const daysSinceLast = daysBetween(lastDate, toValue);
    const status = daysSinceLast <= gap ? "active" : daysSinceLast <= gap + LAPSE_GRACE_DAYS ? "at_risk" : "lapsed";
    statuses.push({ customerId, rows: sorted, lastDate, expectedGapDays: gap, daysSinceLast, status });
  });
  return statuses;
}

function customerValue(rows: SessionRow[], anchorDate: string) {
  const recent = rows.filter((row) => daysBetween(row.localDate, anchorDate) <= 30);
  const kwh = recent.reduce((sum, row) => sum + numberValue(row.energyKwh), 0);
  const value = recent.reduce((sum, row) => sum + revenue(row), 0);
  return { sessions: recent.length, kwh, revenue: value, revenuePerSession: recent.length ? value / recent.length : 0 };
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
    const lookbackFrom = new Date(from.getTime() - LOOKBACK_DAYS * 86400000);
    const result = await getDb().execute(sql`
      SELECT
        cs.customer_identifier_id::text AS customer_id,
        cs.start_at,
        (cs.start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS local_date,
        TO_CHAR(DATE_TRUNC('month', cs.start_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
        cs.duration_seconds,
        cs.charging_amount_kwh AS energy_kwh
      FROM charging_sessions cs
      JOIN stations s ON s.id = cs.station_id
      WHERE (s.canonical_name = 'tce ev station @meta mall'
         OR (s.canonical_name = 'สถานีชาร์จ เมต้า มอลล์' AND NOT EXISTS (SELECT 1 FROM stations primary_station WHERE primary_station.canonical_name = 'tce ev station @meta mall')))
        AND cs.start_at >= ${lookbackFrom}
        AND cs.start_at <= ${to}
      ORDER BY cs.start_at
    `);

    const allRows = (result.rows as unknown as Array<Record<string, unknown>>).map((row) => ({
      customerId: row.customer_id ? String(row.customer_id) : null,
      localDate: String(row.local_date),
      month: String(row.month),
      startAt: row.start_at as string,
      durationSeconds: row.duration_seconds as number | string | null,
      energyKwh: row.energy_kwh as number | string | null,
    }));
    const meaningfulRows = allRows.filter((row) => row.customerId && isMeaningful(row));
    const reportRows = meaningfulRows.filter((row) => new Date(row.startAt).getTime() >= from.getTime());
    const statuses = buildStatuses(meaningfulRows, toValue);
    const regularIds = new Set(statuses.map((status) => status.customerId));
    const regularRows = reportRows.filter((row) => row.customerId && regularIds.has(row.customerId));
    const totalRegularRevenue = regularRows.reduce((sum, row) => sum + revenue(row), 0);
    const totalRegularKwh = regularRows.reduce((sum, row) => sum + numberValue(row.energyKwh), 0);
    const regularSessionCount = regularRows.length;

    const monthly = monthKeys(from, to).map((month) => {
      const monthRows = reportRows.filter((row) => row.month === month);
      const regularMonthRows = monthRows.filter((row) => row.customerId && regularIds.has(row.customerId));
      const activeCustomers = new Set(regularMonthRows.map((row) => row.customerId)).size;
      const monthRevenue = monthRows.reduce((sum, row) => sum + revenue(row), 0);
      const regularRevenue = regularMonthRows.reduce((sum, row) => sum + revenue(row), 0);
      return {
        month,
        sessions: monthRows.length,
        revenueThb: round(monthRevenue, 2),
        regularCustomers: activeCustomers,
        regularRevenueThb: round(regularRevenue, 2),
        averageRevenuePerRegularCustomer: activeCustomers ? round(regularRevenue / activeCustomers, 2) : 0,
      };
    });

    const monthlyValues = monthly.filter((row) => row.regularCustomers > 0).map((row) => row.averageRevenuePerRegularCustomer);
    const regularCustomerValues = statuses.map((status) => ({ ...status, value: customerValue(status.rows, status.lastDate) }));
    const segmentDefinitions = [
      { key: "active" as const, label: "Active", action: "รักษาความถี่และเสนอสิทธิประโยชน์แบบเฉพาะบุคคล" },
      { key: "at_risk" as const, label: "At risk", action: "ส่ง reminder หรือ reward ก่อนพ้นรอบปกติ" },
      { key: "lapsed" as const, label: "Lapsed", action: "ทำ win-back โดยเทียบมูลค่าที่เคยสร้างกับต้นทุนแคมเปญ" },
    ];
    const segments = segmentDefinitions.map((definition) => {
      const customers = regularCustomerValues.filter((row) => row.status === definition.key);
      const totalRevenue = customers.reduce((sum, row) => sum + row.value.revenue, 0);
      const totalSessions = customers.reduce((sum, row) => sum + row.value.sessions, 0);
      return {
        status: definition.key,
        label: definition.label,
        action: definition.action,
        customers: customers.length,
        averageRevenue30d: customers.length ? round(totalRevenue / customers.length, 2) : 0,
        averageSessions30d: customers.length ? round(totalSessions / customers.length, 1) : 0,
        averageRevenuePerSession: totalSessions ? round(totalRevenue / totalSessions, 2) : 0,
        totalObservedValue30d: round(totalRevenue, 2),
      };
    });

    const averageMonthlyValue = average(monthlyValues);
    const averageSessionValue = regularSessionCount ? totalRegularRevenue / regularSessionCount : 0;
    const allReportRevenue = reportRows.reduce((sum, row) => sum + revenue(row), 0);
    const allReportKwh = reportRows.reduce((sum, row) => sum + numberValue(row.energyKwh), 0);

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      observationEndDate: toValue,
      pricing: { flatRateThbPerKwh: FLAT_RATE },
      kpis: {
        reportSessions: reportRows.length,
        reportRevenueThb: round(allReportRevenue, 2),
        reportKwh: round(allReportKwh, 2),
        regularCustomers: regularIds.size,
        regularSessions: regularSessionCount,
        averageRevenuePerMeaningfulSession: round(averageSessionValue, 2),
        averageMonthlyRevenuePerRegularCustomer: round(averageMonthlyValue, 2),
        estimated90DayValue: round(averageMonthlyValue * 3, 2),
        estimated180DayValue: round(averageMonthlyValue * 6, 2),
        regularRevenueShare: allReportRevenue ? round((totalRegularRevenue / allReportRevenue) * 100, 1) : 0,
      },
      segments,
      monthly,
      methodology: {
        meaningfulSession: `Duration ≥ ${MEANINGFUL_MIN_SECONDS / 60} นาที และ Charging Amount ≥ ${MEANINGFUL_MIN_KWH} kWh`,
        regularCustomer: `อย่างน้อย ${REGULAR_MIN_SESSIONS} meaningful sessions ใน rolling 30 วัน และกระจายอย่างน้อย ${REGULAR_MIN_WEEKS} สัปดาห์`,
        value: `รายได้ = kWh × ${FLAT_RATE.toFixed(2)} บาท`,
        scenario: "90/180-day value เป็น scenario จากค่าเฉลี่ยรายเดือน ไม่ใช่การรับประกันรายได้ในอนาคตหรือ CLV ทางบัญชี",
        customerKey: "customer_identifier_id จาก Card Number/User ID ของ Order List",
      },
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่านข้อมูล Customer Value ไม่สำเร็จ" }, { status: 500 });
  }
}

import { sql } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";

const DEFAULT_FROM = "2026-05-18";
const DEFAULT_TO = "2026-09-16";
const LOOKBACK_DAYS = 60;
const MEANINGFUL_MIN_SECONDS = 300;
const MEANINGFUL_MIN_KWH = 1;
const REGULAR_MIN_SESSIONS = 3;
const REGULAR_MIN_WEEKS = 2;

type Row = { customerId: string | null; localDate: string; startAt: string | Date; durationSeconds: number | string | null; energyKwh: number | string | null };

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

function parseLocalDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function weekKey(value: string) {
  const date = parseLocalDate(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function meaningful(row: Row) {
  return numberValue(row.durationSeconds) >= MEANINGFUL_MIN_SECONDS && numberValue(row.energyKwh) >= MEANINGFUL_MIN_KWH;
}

function qualifiesAsRegular(rows: Row[]) {
  if (rows.length < REGULAR_MIN_SESSIONS) return false;
  return rows.some((row) => {
    const end = parseLocalDate(row.localDate).getTime();
    const start = end - 30 * 86400000;
    const recent = rows.filter((candidate) => {
      const time = parseLocalDate(candidate.localDate).getTime();
      return time >= start && time <= end;
    });
    return recent.length >= REGULAR_MIN_SESSIONS && new Set(recent.map((candidate) => weekKey(candidate.localDate))).size >= REGULAR_MIN_WEEKS;
  });
}

function dateKeys(from: string, to: string) {
  const keys: string[] = [];
  const cursor = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function phaseFor(day: number) {
  return day <= 10 ? "ต้นเดือน" : day <= 20 ? "กลางเดือน" : "ปลายเดือน";
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
        (cs.start_at AT TIME ZONE 'Asia/Bangkok')::date::text AS local_date,
        cs.start_at,
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

    const rows = (result.rows as unknown as Array<Record<string, unknown>>).map((row) => ({
      customerId: row.customer_id ? String(row.customer_id) : null,
      localDate: String(row.local_date),
      startAt: row.start_at as string,
      durationSeconds: row.duration_seconds as number | string | null,
      energyKwh: row.energy_kwh as number | string | null,
    }));
    const reportRows = rows.filter((row) => new Date(row.startAt).getTime() >= from.getTime());
    const reportMeaningful = reportRows.filter(meaningful);
    const knownMeaningful = rows.filter((row) => row.customerId && meaningful(row));
    const byCustomer = new Map<string, Row[]>();
    reportMeaningful.forEach((row) => {
      if (!row.customerId) return;
      const current = byCustomer.get(row.customerId) ?? [];
      current.push(row);
      byCustomer.set(row.customerId, current);
    });
    const allCustomerRows = new Map<string, Row[]>();
    knownMeaningful.forEach((row) => {
      const current = allCustomerRows.get(row.customerId as string) ?? [];
      current.push(row);
      allCustomerRows.set(row.customerId as string, current);
    });
    const regularCustomers = new Set([...allCustomerRows.entries()].filter(([, customerRows]) => qualifiesAsRegular(customerRows)).map(([customerId]) => customerId));
    const customerCounts = [...byCustomer.values()].map((customerRows) => customerRows.length);
    const days = dateKeys(fromValue, toValue);
    const sessionsByDate = new Map<string, number>();
    reportMeaningful.forEach((row) => sessionsByDate.set(row.localDate, (sessionsByDate.get(row.localDate) ?? 0) + 1));
    const weekdayLabels = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
    const weekday = weekdayLabels.map((label, index) => {
      const matchingDays = days.filter((date) => ((parseLocalDate(date).getUTCDay() + 6) % 7) === index);
      const sessions = matchingDays.reduce((sum, date) => sum + (sessionsByDate.get(date) ?? 0), 0);
      return { label, sessions, days: matchingDays.length, averageSessions: matchingDays.length ? round(sessions / matchingDays.length, 1) : 0 };
    });
    const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0 }));
    reportMeaningful.forEach((row) => {
      const hour = new Date(row.startAt).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" });
      const hourNumber = Number(hour) % 24;
      hourlyCounts[hourNumber].sessions += 1;
    });
    const hourly = hourlyCounts.map((row) => ({ ...row, averageSessions: days.length ? round(row.sessions / days.length, 1) : 0 }));
    const phaseLabels = ["ต้นเดือน", "กลางเดือน", "ปลายเดือน"];
    const phase = phaseLabels.map((label) => {
      const phaseDays = days.filter((date) => phaseFor(Number(date.slice(8, 10))) === label);
      const sessions = phaseDays.reduce((sum, date) => sum + (sessionsByDate.get(date) ?? 0), 0);
      return { label, days: phaseDays.length, sessions, averageSessions: phaseDays.length ? round(sessions / phaseDays.length, 1) : 0 };
    });
    const repeatCustomers = customerCounts.filter((count) => count >= 2).length;
    const oneTimeCustomers = customerCounts.filter((count) => count === 1).length;
    const totalKnownCustomers = byCustomer.size;
    const topHours = [...hourly].sort((a, b) => b.sessions - a.sessions).slice(0, 3).map((row) => row.hour);
    const lowHours = [...hourly].sort((a, b) => a.sessions - b.sessions).slice(0, 3).map((row) => row.hour);
    const topWeekday = [...weekday].sort((a, b) => b.averageSessions - a.averageSessions)[0];
    const lowWeekday = [...weekday].sort((a, b) => a.averageSessions - b.averageSessions)[0];

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      privacy: { scope: "partner_safe", excluded: ["revenue", "energy", "flat_rate", "customer_id", "vehicle_identity"] },
      kpis: {
        sessions: reportRows.length,
        meaningfulSessions: reportMeaningful.length,
        uniqueCustomers: totalKnownCustomers,
        unknownCustomerSessions: reportMeaningful.filter((row) => !row.customerId).length,
        oneTimeCustomers,
        repeatCustomers,
        repeatRate: totalKnownCustomers ? round((repeatCustomers / totalKnownCustomers) * 100, 1) : 0,
        regularCustomers: [...regularCustomers].filter((customerId) => byCustomer.has(customerId)).length,
        averageSessionsPerCustomer: totalKnownCustomers ? round(reportMeaningful.length / totalKnownCustomers, 1) : 0,
      },
      recurrence: [
        { label: "ใช้ 1 ครั้ง", customers: oneTimeCustomers },
        { label: "ใช้ 2 ครั้ง", customers: customerCounts.filter((count) => count === 2).length },
        { label: "ใช้ 3–4 ครั้ง", customers: customerCounts.filter((count) => count >= 3 && count <= 4).length },
        { label: "ใช้ 5 ครั้งขึ้นไป", customers: customerCounts.filter((count) => count >= 5).length },
      ],
      weekday,
      hourly,
      phase,
      decisionSignals: {
        topHours,
        lowHours,
        topWeekday: topWeekday?.label ?? null,
        lowWeekday: lowWeekday?.label ?? null,
      },
      methodology: {
        meaningful: `นับ session ที่มี Duration ≥ ${MEANINGFUL_MIN_SECONDS / 60} นาที และพลังงาน ≥ ${MEANINGFUL_MIN_KWH} kWh เพื่อไม่นับ retry/รายการสั้นเป็นพฤติกรรมหลัก`,
        repeat: "ลูกค้าที่มี meaningful session ตั้งแต่ 2 ครั้งขึ้นไปในช่วงวันที่เลือก",
        regular: `ลูกค้าที่มีอย่างน้อย ${REGULAR_MIN_SESSIONS} meaningful sessions ใน rolling 30 วัน และกระจายอย่างน้อย ${REGULAR_MIN_WEEKS} สัปดาห์`,
        note: "หน้านี้แสดงเฉพาะจำนวนและ pattern ไม่มีรายได้ พลังงาน ราคา หรือรหัสลูกค้า",
      },
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "อ่าน Partner Insights ไม่สำเร็จ" }, { status: 500 });
  }
}

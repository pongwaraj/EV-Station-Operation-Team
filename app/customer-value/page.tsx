"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { inputDate, rangeLabel } from "../../lib/display-date";

type Segment = { status: "active" | "at_risk" | "lapsed"; label: string; action: string; customers: number; averageRevenue30d: number; averageSessions30d: number; averageRevenuePerSession: number; totalObservedValue30d: number };
type CustomerValueData = {
  message?: string;
  range?: { from: string; to: string };
  pricing?: { flatRateThbPerKwh: number };
  kpis?: { reportSessions: number; reportRevenueThb: number; reportKwh: number; regularCustomers: number; regularSessions: number; averageRevenuePerMeaningfulSession: number; averageMonthlyRevenuePerRegularCustomer: number; estimated90DayValue: number; estimated180DayValue: number; regularRevenueShare: number };
  segments?: Segment[];
  monthly?: Array<{ month: string; sessions: number; revenueThb: number; regularCustomers: number; regularRevenueThb: number; averageRevenuePerRegularCustomer: number }>;
  methodology?: { meaningfulSession: string; regularCustomer: string; value: string; scenario: string; customerKey: string };
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatMoney(value: number, maximumFractionDigits = 0) {
  return `฿${formatNumber(value, maximumFractionDigits)}`;
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}-01T00:00:00+07:00`));
}

function statusClass(status: Segment["status"]) {
  return `value-segment ${status}`;
}

export default function CustomerValuePage() {
  const [from, setFrom] = useState("2026-07-31");
  const [to, setTo] = useState("2026-09-16");
  const [data, setData] = useState<CustomerValueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: start, to: end });
      const response = await fetch(`/api/dashboard/customer-value?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as CustomerValueData;
      if (!response.ok) throw new Error(result.message ?? "customer value unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load customer value", loadError);
      setError("ยังไม่สามารถคำนวณ Customer Lifetime Value ได้ กรุณาตรวจสอบข้อมูลลูกค้าและการเชื่อมต่อฐานข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(from, to); }, 0);
    return () => window.clearTimeout(timer);
  }, [from, to, load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(from, to);
  }

  return (
    <main className="shell customer-value-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">CUSTOMER VALUE · CRM DECISION SUPPORT</p>
        <h1>Customer Lifetime Value & CRM</h1>
        <p className="lede">ดูว่าลูกค้าประจำสร้างมูลค่าจากการชาร์จครั้งหนึ่งและต่อเดือนเท่าไร เพื่อกำหนดงบประมาณและเลือกกลุ่มเป้าหมายของแคมเปญ CRM อย่างมีหลักฐาน</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดต Customer Value</button>
        </form>
        <p className="hint drilldown-note">ช่วงข้อมูล: {data?.range ? rangeLabel(data.range) : `${from} – ${to}`} · คำนวณจาก meaningful session และอัตรา flat rate {formatMoney(data?.pricing?.flatRateThbPerKwh ?? 7.9, 2)}/kWh</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังคำนวณมูลค่าลูกค้าประจำ…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void load(from, to)}>ลองใหม่</button></section>}

      {data?.kpis && !loading && !error && (
        <>
          <p className="loaded-period">ข้อมูลที่แสดง: {data.range ? rangeLabel(data.range) : "-"}</p>

          <section className="grid kpi-grid customer-value-kpi-grid">
            <article className="card"><p className="card-label">รายได้เฉลี่ย / meaningful session</p><p className="kpi-value">{formatMoney(data.kpis.averageRevenuePerMeaningfulSession, 2)}</p><p className="hint">ใช้เป็นฐานดูความคุ้มค่าของ offer ต่อครั้ง</p></article>
            <article className="card"><p className="card-label">รายได้เฉลี่ย / ลูกค้าประจำ / 30 วัน</p><p className="kpi-value">{formatMoney(data.kpis.averageMonthlyRevenuePerRegularCustomer, 0)}</p><p className="hint">มูลค่าที่สังเกตได้จากค่าเฉลี่ยรายเดือน</p></article>
            <article className="card"><p className="card-label">Indicative 90-day value</p><p className="kpi-value">{formatMoney(data.kpis.estimated90DayValue, 0)}</p><p className="hint">scenario จากรายได้เฉลี่ยต่อเดือน × 3</p></article>
            <article className="card"><p className="card-label">ลูกค้าประจำ</p><p className="kpi-value">{formatNumber(data.kpis.regularCustomers)}<small> คน</small></p><p className="hint">สร้างรายได้ {formatNumber(data.kpis.regularRevenueShare, 1)}% ของช่วงที่เลือก</p></article>
          </section>

          <section className="panel customer-value-readout">
            <div><p className="section-label">CRM DECISION SIGNAL</p><h2>ใช้มูลค่าลูกค้าประจำกำหนดน้ำหนักแคมเปญ</h2><p>ลูกค้าประจำสร้างรายได้เฉลี่ย {formatMoney(data.kpis.averageMonthlyRevenuePerRegularCustomer, 0)} ต่อ 30 วัน และ {formatMoney(data.kpis.averageRevenuePerMeaningfulSession, 2)} ต่อ meaningful session ควรใช้ตัวเลขนี้เป็นฐานเปรียบเทียบกับต้นทุนส่วนลดและค่าใช้จ่าย CRM</p></div>
            <div className="customer-value-scenarios"><div><span>90 วัน</span><strong>{formatMoney(data.kpis.estimated90DayValue, 0)}</strong></div><div><span>180 วัน</span><strong>{formatMoney(data.kpis.estimated180DayValue, 0)}</strong></div></div>
          </section>

          <section className="panel customer-value-segment-panel">
            <div className="decision-heading"><div><p className="section-label">CRM SEGMENTS</p><h2>มูลค่าตามสถานะลูกค้าประจำ</h2></div><span className="period-label">ใช้เลือกกลุ่มและข้อเสนอ</span></div>
            <div className="customer-value-segment-grid">
              {(data.segments ?? []).map((segment) => <article className={statusClass(segment.status)} key={segment.status}><div className="value-segment-heading"><span>{segment.label}</span><strong>{formatNumber(segment.customers)} คน</strong></div><div className="value-segment-value">{formatMoney(segment.averageRevenue30d, 0)}<small>เฉลี่ยต่อคน / 30 วัน</small></div><dl><div><dt>Sessions / 30 วัน</dt><dd>{formatNumber(segment.averageSessions30d, 1)}</dd></div><div><dt>รายได้ / session</dt><dd>{formatMoney(segment.averageRevenuePerSession, 2)}</dd></div><div><dt>มูลค่ารวมของกลุ่ม</dt><dd>{formatMoney(segment.totalObservedValue30d, 0)}</dd></div></dl><p>{segment.action}</p></article>)}
            </div>
          </section>

          <section className="panel customer-value-monthly-panel">
            <div className="decision-heading"><div><p className="section-label">MONTHLY VALUE TREND</p><h2>รายได้ลูกค้าประจำเทียบกับจำนวนลูกค้า</h2></div><span className="period-label">ค่าเฉลี่ยต่อคนใช้วางแผน CRM</span></div>
            <div className="customer-value-monthly-chart" role="img" aria-label="กราฟรายได้เฉลี่ยต่อลูกค้าประจำรายเดือน">
              {(data.monthly ?? []).map((row) => { const max = Math.max(...(data.monthly ?? []).map((item) => item.averageRevenuePerRegularCustomer), 1); return <div className="customer-value-month" key={row.month} title={`${formatMonth(row.month)} · ${formatMoney(row.averageRevenuePerRegularCustomer, 0)} ต่อคน · ${formatNumber(row.regularCustomers)} คน`}><strong>{formatMoney(row.averageRevenuePerRegularCustomer, 0)}</strong><div className="customer-value-bar" style={{ height: `${Math.max(4, row.averageRevenuePerRegularCustomer / max * 100)}%` }} /><span>{formatMonth(row.month)}</span><small>{formatNumber(row.regularCustomers)} คน</small></div>; })}
            </div>
          </section>

          <section className="panel customer-value-method-panel"><p className="section-label">นิยามและข้อจำกัด</p><div className="utilization-method-grid"><div><strong>Meaningful session</strong><span>{data.methodology?.meaningfulSession}</span></div><div><strong>ลูกค้าประจำ</strong><span>{data.methodology?.regularCustomer}</span></div><div><strong>การตีความ CLV</strong><span>{data.methodology?.scenario}</span></div></div><p className="chart-footnote">{data.methodology?.value} · Customer key: {data.methodology?.customerKey} · รายได้เป็นประมาณการ flat rate ไม่ใช่ยอดรับเงินจริง</p></section>
        </>
      )}
    </main>
  );
}

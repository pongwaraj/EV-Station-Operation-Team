"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { rangeLabel } from "../../lib/display-date";

type PartnerData = {
  message?: string;
  range?: { from: string; to: string };
  privacy?: { scope: string; excluded: string[] };
  kpis?: { sessions: number; meaningfulSessions: number; uniqueCustomers: number; unknownCustomerSessions: number; oneTimeCustomers: number; repeatCustomers: number; repeatRate: number; regularCustomers: number; averageSessionsPerCustomer: number };
  recurrence?: Array<{ label: string; customers: number }>;
  crmSegments?: { newCustomers: number; returningCustomers: number; reactivatedCustomers: number; reactivationGapDays: number };
  weekday?: Array<{ label: string; sessions: number; days: number; averageSessions: number }>;
  hourly?: Array<{ hour: number; sessions: number; averageSessions: number }>;
  phase?: Array<{ label: string; days: number; sessions: number; averageSessions: number }>;
  decisionSignals?: { topHours: number[]; lowHours: number[]; topWeekday: string | null; lowWeekday: string | null };
  methodology?: { meaningful: string; repeat: string; regular: string; note: string };
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function hourLabel(hour: number) { return `${String(hour).padStart(2, "0")}:00`; }

export default function PartnerInsightsPage() {
  const [from, setFrom] = useState("2026-05-18");
  const [to, setTo] = useState("2026-09-17");
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: start, to: end });
      const response = await fetch(`/api/dashboard/partner-insights?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as PartnerData;
      if (!response.ok) throw new Error(result.message ?? "partner insights unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load partner insights", loadError);
      setError("ยังไม่สามารถอ่านพฤติกรรมลูกค้าได้ กรุณาตรวจสอบข้อมูลการชาร์จ");
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

  const maxWeekday = useMemo(() => Math.max(...(data?.weekday ?? []).map((row) => row.averageSessions), 1), [data]);
  const maxHourly = useMemo(() => Math.max(...(data?.hourly ?? []).map((row) => row.sessions), 1), [data]);

  return (
    <main className="shell partner-insights-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">CUSTOMER BEHAVIOUR</p>
        <h1>พฤติกรรมการใช้บริการ</h1>
        <p className="lede">ภาพรวมจำนวนครั้ง กลุ่มลูกค้า และช่วงเวลาที่มีการใช้งาน เพื่อใช้วางแผนกิจกรรมและส่งเสริมการกลับมาใช้บริการ</p>
      </section>

      <section className="partner-safe-banner"><span className="partner-safe-icon">✓</span><div><strong>แนวทางการอ่านข้อมูล</strong><p>เลือกช่วงวันที่เพื่อเปรียบเทียบพฤติกรรมลูกค้าและค้นหาจังหวะที่เหมาะกับกิจกรรมส่งเสริมการใช้บริการ</p></div></section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตพฤติกรรม</button>
        </form>
        <p className="hint drilldown-note">{data?.range ? rangeLabel(data.range) : `ข้อมูลที่แสดง: ${from} – ${to}`}</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังสรุปพฤติกรรมลูกค้า…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void load(from, to)}>ลองใหม่</button></section>}

      {data?.kpis && !loading && !error && (
        <>
          <section className="grid kpi-grid partner-insights-kpi-grid">
            <article className="card"><p className="card-label">จำนวนการใช้บริการ</p><p className="kpi-value">{formatNumber(data.kpis.sessions)}<small> ครั้ง</small></p><p className="hint">เข้าเกณฑ์วิเคราะห์พฤติกรรม {formatNumber(data.kpis.meaningfulSessions)} ครั้ง</p></article>
            <article className="card"><p className="card-label">ผู้ใช้งานที่เข้าเกณฑ์วิเคราะห์</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}<small> คน</small></p><p className="hint">นับผู้ใช้งานแต่ละรายเพียงครั้งเดียว</p></article>
            <article className="card"><p className="card-label">ลูกค้าที่กลับมาใช้ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.repeatRate, 1)}<small>%</small></p><p className="hint">{formatNumber(data.kpis.repeatCustomers)} คน จากผู้ใช้ที่ระบุรหัสได้</p></article>
            <article className="card"><p className="card-label">ลูกค้าประจำ</p><p className="kpi-value">{formatNumber(data.kpis.regularCustomers)}<small> คน</small></p><p className="hint">เฉลี่ย {formatNumber(data.kpis.averageSessionsPerCustomer, 1)} ครั้งที่เข้าเกณฑ์/คน</p></article>
          </section>

          <section className="panel partner-crm-panel"><div className="decision-heading"><div><p className="section-label">CRM SEGMENTS</p><h2>กลุ่มลูกค้าสำหรับวางแผนกิจกรรม</h2></div><span className="period-label">แต่ละกลุ่มอาจมีลูกค้าซ้ำกันได้</span></div><div className="partner-crm-grid"><div><span>พบการใช้บริการครั้งแรกในช่วงที่เลือก</span><strong>{formatNumber(data.crmSegments?.newCustomers ?? 0)} คน</strong><small>ใช้วางกิจกรรมต้อนรับและสร้างการทดลองใช้</small></div><div><span>กลับมาใช้ซ้ำในช่วงที่เลือก</span><strong>{formatNumber(data.crmSegments?.returningCustomers ?? 0)} คน</strong><small>ใช้วางกิจกรรมรักษาความถี่ในการใช้บริการ</small></div><div><span>กลับมาใช้อีกครั้งหลังเว้นช่วง</span><strong>{formatNumber(data.crmSegments?.reactivatedCustomers ?? 0)} คน</strong><small>เว้นจากครั้งก่อนอย่างน้อย {formatNumber(data.crmSegments?.reactivationGapDays ?? 14)} วัน</small></div></div></section>

          <section className="panel partner-decision-panel"><p className="section-label">ACTIVITY TIMING</p><h2>จังหวะที่เหมาะกับกิจกรรม</h2><div className="partner-decision-grid"><div><span>วันที่มีการใช้บริการสูง</span><strong>{data.decisionSignals?.topWeekday ?? "-"}</strong><small>เหมาะกับกิจกรรมที่ต้องการจำนวนผู้เข้าร่วม</small></div><div><span>วันที่มีการใช้บริการต่ำ</span><strong>{data.decisionSignals?.lowWeekday ?? "-"}</strong><small>เหมาะกับกิจกรรมกระตุ้นการใช้บริการ</small></div><div><span>ช่วงเวลาหลัก</span><strong>{(data.decisionSignals?.topHours ?? []).map(hourLabel).join(" · ") || "-"}</strong><small>วางกิจกรรมให้สอดคล้องกับพฤติกรรมลูกค้า</small></div><div><span>ช่วงเวลานอกพีก</span><strong>{(data.decisionSignals?.lowHours ?? []).map(hourLabel).join(" · ") || "-"}</strong><small>เหมาะสำหรับทดลองข้อเสนอในช่วงที่ใช้งานน้อย</small></div></div></section>

          <section className="partner-insights-grid">
            <article className="panel"><div className="decision-heading"><div><p className="section-label">CUSTOMER RECURRENCE</p><h2>ความถี่การกลับมาใช้</h2></div><span className="period-label">นับรายการที่เข้าเกณฑ์วิเคราะห์</span></div><div className="partner-recurrence-list">{(data.recurrence ?? []).map((row) => <div key={row.label}><span>{row.label}</span><div className="partner-track"><i style={{ width: `${data.kpis?.uniqueCustomers ? Math.min(100, row.customers / data.kpis.uniqueCustomers * 100) : 0}%` }} /></div><strong>{formatNumber(row.customers)} คน</strong></div>)}</div></article>
            <article className="panel"><div className="decision-heading"><div><p className="section-label">MONTH PHASE</p><h2>ต้นเดือน / กลางเดือน / ปลายเดือน</h2></div><span className="period-label">เฉลี่ยต่อวัน</span></div><table className="partner-pattern-table"><thead><tr><th>ช่วง</th><th>วัน</th><th>ครั้ง/วัน</th></tr></thead><tbody>{(data.phase ?? []).map((row) => <tr key={row.label}><td>{row.label}</td><td>{formatNumber(row.days)}</td><td><strong>{formatNumber(row.averageSessions, 1)}</strong></td></tr>)}</tbody></table></article>
          </section>

          <section className="panel partner-pattern-panel"><div className="decision-heading"><div><p className="section-label">WEEKDAY PATTERN</p><h2>จำนวนการใช้บริการเฉลี่ย จันทร์–อาทิตย์</h2></div><span className="period-label">ใช้เลือกรูปแบบกิจกรรมในแต่ละวัน</span></div><div className="partner-weekday-chart">{(data.weekday ?? []).map((row) => <div className="partner-weekday-column" key={row.label} title={`${row.label} · เฉลี่ย ${formatNumber(row.averageSessions, 1)} ครั้ง/วัน`}><strong>{formatNumber(row.averageSessions, 1)}</strong><i style={{ height: `${Math.max(4, row.averageSessions / maxWeekday * 100)}%` }} /><span>{row.label.slice(0, 3)}</span></div>)}</div></section>

          <section className="panel partner-pattern-panel"><div className="decision-heading"><div><p className="section-label">HOURLY PATTERN</p><h2>จำนวนการใช้บริการตามช่วงเวลา</h2></div><span className="period-label">นับเวลาที่เริ่มชาร์จในแต่ละชั่วโมง</span></div><div className="partner-hourly-chart">{(data.hourly ?? []).map((row) => <div className="partner-hourly-column" key={row.hour} title={`${hourLabel(row.hour)} · ${formatNumber(row.sessions)} ครั้ง · เฉลี่ย ${formatNumber(row.averageSessions, 1)} ครั้ง/วัน`}><strong>{row.sessions > 0 ? formatNumber(row.averageSessions, 1) : ""}</strong><i style={{ height: `${Math.max(2, row.sessions / maxHourly * 100)}%` }} /><span>{row.hour % 2 === 0 ? String(row.hour).padStart(2, "0") : ""}</span></div>)}</div></section>

          <section className="panel partner-method-panel"><p className="section-label">หลักเกณฑ์การวิเคราะห์</p><p>{data.methodology?.meaningful} · {data.methodology?.repeat} · {data.methodology?.regular}</p><p className="chart-footnote">{data.methodology?.note} · การคำนวณการใช้ซ้ำอ้างอิงเฉพาะรายการที่เชื่อมโยงผู้ใช้งานได้</p></section>
        </>
      )}
    </main>
  );
}

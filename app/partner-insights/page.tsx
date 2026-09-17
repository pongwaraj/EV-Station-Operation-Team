"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { rangeLabel } from "../../lib/display-date";

type PartnerData = {
  message?: string;
  range?: { from: string; to: string };
  privacy?: { scope: string; excluded: string[] };
  kpis?: { sessions: number; meaningfulSessions: number; uniqueCustomers: number; unknownCustomerSessions: number; oneTimeCustomers: number; repeatCustomers: number; repeatRate: number; regularCustomers: number; averageSessionsPerCustomer: number };
  recurrence?: Array<{ label: string; customers: number }>;
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
  const [to, setTo] = useState("2026-09-16");
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
        <p className="eyebrow">PARTNER VIEW · COUNTS ONLY</p>
        <h1>Customer Behavior Insights</h1>
        <p className="lede">ภาพรวมพฤติกรรมการใช้สถานีสำหรับนำเสนอ partner โดยแสดงเฉพาะจำนวนครั้ง กลุ่มลูกค้า และจังหวะ demand ไม่มีรายได้ ราคา พลังงาน หรือรหัสลูกค้า</p>
      </section>

      <section className="partner-safe-banner"><span className="partner-safe-icon">✓</span><div><strong>Partner-safe view</strong><p>ข้อมูลในหน้านี้ตัดรายได้ พลังงาน อัตราค่าบริการ และ Customer ID ออก เหลือเฉพาะสถิติรวมเพื่อใช้วางแผนกิจกรรมการตลาด</p></div></section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตพฤติกรรม</button>
        </form>
        <p className="hint drilldown-note">ข้อมูลที่แสดง: {data?.range ? rangeLabel(data.range) : `${from} – ${to}`}</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังสรุปพฤติกรรมลูกค้า…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void load(from, to)}>ลองใหม่</button></section>}

      {data?.kpis && !loading && !error && (
        <>
          <p className="loaded-period">ข้อมูลที่แสดง: {data.range ? rangeLabel(data.range) : "-"}</p>
          <section className="grid kpi-grid partner-insights-kpi-grid">
            <article className="card"><p className="card-label">จำนวนการชาร์จ</p><p className="kpi-value">{formatNumber(data.kpis.sessions)}<small> ครั้ง</small></p><p className="hint">Meaningful {formatNumber(data.kpis.meaningfulSessions)} ครั้ง</p></article>
            <article className="card"><p className="card-label">ผู้ใช้งานไม่ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}<small> คน</small></p><p className="hint">นับจาก Customer ID ที่มีในระบบ</p></article>
            <article className="card"><p className="card-label">ลูกค้าที่กลับมาใช้ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.repeatRate, 1)}<small>%</small></p><p className="hint">{formatNumber(data.kpis.repeatCustomers)} คน จากผู้ใช้ที่ระบุรหัสได้</p></article>
            <article className="card"><p className="card-label">ลูกค้าประจำ</p><p className="kpi-value">{formatNumber(data.kpis.regularCustomers)}<small> คน</small></p><p className="hint">เฉลี่ย {formatNumber(data.kpis.averageSessionsPerCustomer, 1)} meaningful ครั้ง / คน</p></article>
          </section>

          <section className="panel partner-decision-panel"><p className="section-label">MARKETING READOUT</p><h2>ช่วงเวลาที่เหมาะกับการทำกิจกรรม partner</h2><div className="partner-decision-grid"><div><span>วัน demand สูง</span><strong>{data.decisionSignals?.topWeekday ?? "-"}</strong><small>ใช้วางกิจกรรมที่ต้องการ traffic</small></div><div><span>วัน demand ต่ำ</span><strong>{data.decisionSignals?.lowWeekday ?? "-"}</strong><small>เหมาะกับการทดลองกิจกรรมกระตุ้นการใช้</small></div><div><span>ช่วงเวลาหลัก</span><strong>{(data.decisionSignals?.topHours ?? []).map(hourLabel).join(" · ") || "-"}</strong><small>วางกิจกรรมให้สอดคล้องกับพฤติกรรม</small></div><div><span>ช่วงเวลานอกพีก</span><strong>{(data.decisionSignals?.lowHours ?? []).map(hourLabel).join(" · ") || "-"}</strong><small>เหมาะสำหรับทดสอบ offer โดยไม่ชนพีก</small></div></div></section>

          <section className="partner-insights-grid">
            <article className="panel"><div className="decision-heading"><div><p className="section-label">CUSTOMER RECURRENCE</p><h2>ความถี่การกลับมาใช้</h2></div><span className="period-label">นับ meaningful session</span></div><div className="partner-recurrence-list">{(data.recurrence ?? []).map((row) => <div key={row.label}><span>{row.label}</span><div className="partner-track"><i style={{ width: `${data.kpis?.uniqueCustomers ? Math.min(100, row.customers / data.kpis.uniqueCustomers * 100) : 0}%` }} /></div><strong>{formatNumber(row.customers)} คน</strong></div>)}</div></article>
            <article className="panel"><div className="decision-heading"><div><p className="section-label">MONTH PHASE</p><h2>ต้นเดือน / กลางเดือน / ปลายเดือน</h2></div><span className="period-label">เฉลี่ยต่อวัน</span></div><table className="partner-pattern-table"><thead><tr><th>ช่วง</th><th>วัน</th><th>ครั้ง/วัน</th></tr></thead><tbody>{(data.phase ?? []).map((row) => <tr key={row.label}><td>{row.label}</td><td>{formatNumber(row.days)}</td><td><strong>{formatNumber(row.averageSessions, 1)}</strong></td></tr>)}</tbody></table></article>
          </section>

          <section className="panel partner-pattern-panel"><div className="decision-heading"><div><p className="section-label">WEEKDAY PATTERN</p><h2>จำนวนการชาร์จเฉลี่ยรายวัน จันทร์–อาทิตย์</h2></div><span className="period-label">Order Type ทั้งหมด · ใช้เลือกวันที่ทำ campaign</span></div><div className="partner-weekday-chart">{(data.weekday ?? []).map((row) => <div className="partner-weekday-column" key={row.label} title={`${row.label} · เฉลี่ย ${formatNumber(row.averageSessions, 1)} ครั้ง/วัน`}><strong>{formatNumber(row.averageSessions, 1)}</strong><i style={{ height: `${Math.max(4, row.averageSessions / maxWeekday * 100)}%` }} /><span>{row.label.slice(0, 3)}</span></div>)}</div></section>

          <section className="panel partner-pattern-panel"><div className="decision-heading"><div><p className="section-label">HOURLY PATTERN</p><h2>จำนวนการชาร์จตามช่วงเวลา</h2></div><span className="period-label">Order Type ทั้งหมด · session ที่เริ่มในแต่ละชั่วโมง</span></div><div className="partner-hourly-chart">{(data.hourly ?? []).map((row) => <div className="partner-hourly-column" key={row.hour} title={`${hourLabel(row.hour)} · ${formatNumber(row.sessions)} ครั้ง · เฉลี่ย ${formatNumber(row.averageSessions, 1)} ครั้ง/วัน`}><strong>{row.sessions > 0 ? formatNumber(row.averageSessions, 1) : ""}</strong><i style={{ height: `${Math.max(2, row.sessions / maxHourly * 100)}%` }} /><span>{row.hour % 2 === 0 ? String(row.hour).padStart(2, "0") : ""}</span></div>)}</div></section>

          <section className="panel partner-method-panel"><p className="section-label">นิยามสำหรับการแชร์กับ partner</p><p>{data.methodology?.meaningful} · {data.methodology?.repeat} · {data.methodology?.regular}</p><p className="chart-footnote">{data.methodology?.note} · Sessions ที่ไม่มี Customer ID ไม่ถูกนำไปคำนวณ repeat rate</p></section>
        </>
      )}
    </main>
  );
}

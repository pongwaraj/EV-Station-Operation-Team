"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { rangeLabel } from "../../lib/display-date";

type OverviewData = {
  message?: string;
  range?: { from: string; to: string };
  kpis?: { sessions: number; meaningfulSessions: number; uniqueCustomers: number; energyKwh: number; averageKwhPerSession: number; averageDurationMinutes: number; shortSessions: number; shortSessionRate: number };
  trend?: Array<{ date: string; sessions: number; energyKwh: number }>;
  imports?: { lastImportAt: string | null };
  methodology?: { energy: string; note: string };
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "-";
}

export default function PartnerOverviewPage() {
  const [from, setFrom] = useState("2026-05-18");
  const [to, setTo] = useState("2026-09-17");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: start, to: end });
      const response = await fetch(`/api/dashboard/partner-overview?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as OverviewData;
      if (!response.ok) throw new Error(result.message ?? "partner overview unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load partner overview", loadError);
      setError("ยังไม่สามารถอ่านภาพรวมสถานีได้ กรุณาลองใหม่");
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

  const maxEnergy = Math.max(...(data?.trend ?? []).map((row) => row.energyKwh), 1);

  return (
    <main className="shell partner-overview-shell">
      <section className="hero compact-hero"><p className="eyebrow">META MALL STATION INSIGHTS</p><h1>ภาพรวมสถานี Meta Mall</h1><p className="lede">ข้อมูลการใช้บริการ ปริมาณการชาร์จ และแนวโน้มลูกค้า เพื่อใช้ประกอบการวางแผนกิจกรรมร่วมกัน</p></section>
      <section className="partner-safe-banner"><span className="partner-safe-icon">✓</span><div><strong>ภาพรวมพร้อมใช้งาน</strong><p>เลือกช่วงวันที่เพื่อดูการใช้บริการและแนวโน้มของสถานีในมุมที่ต้องการ</p></div></section>
      <section className="panel filter-panel"><form className="filter-form" onSubmit={submit}><label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="submit" disabled={loading}>อัปเดตภาพรวม</button></form><p className="hint drilldown-note">{data?.range ? rangeLabel(data.range) : `ข้อมูลที่แสดง: ${from} – ${to}`}</p></section>
      {loading && <section className="panel loading-state"><p>กำลังสรุปภาพรวมสถานี…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void load(from, to)}>ลองใหม่</button></section>}
      {data?.kpis && !loading && !error && <>
        <section className="grid kpi-grid partner-overview-kpi-grid"><article className="card"><p className="card-label">จำนวนการใช้บริการ</p><p className="kpi-value">{formatNumber(data.kpis.sessions)}<small> ครั้ง</small></p><p className="hint">เข้าเกณฑ์วิเคราะห์พฤติกรรม {formatNumber(data.kpis.meaningfulSessions)} ครั้ง</p></article><article className="card"><p className="card-label">ผู้ใช้งานไม่ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}<small> คน</small></p><p className="hint">นับผู้ใช้งานแต่ละรายเพียงครั้งเดียว</p></article><article className="card"><p className="card-label">ปริมาณการชาร์จรวม</p><p className="kpi-value">{formatNumber(data.kpis.energyKwh, 2)}<small> kWh</small></p><p className="hint">เฉลี่ย {formatNumber(data.kpis.averageKwhPerSession, 2)} kWh/ครั้ง</p></article><article className="card"><p className="card-label">ระยะเวลาชาร์จเฉลี่ย</p><p className="kpi-value">{formatNumber(data.kpis.averageDurationMinutes, 1)}<small> นาที</small></p><p className="hint">ระยะเวลาที่ลูกค้าใช้บริการโดยเฉลี่ย</p></article></section>
        <section className="panel partner-decision-panel"><p className="section-label">STATION HIGHLIGHTS</p><h2>ภาพรวมการใช้งานในช่วงที่เลือก</h2><div className="partner-decision-grid"><div><span>จำนวนครั้งที่ใช้บริการ</span><strong>{formatNumber(data.kpis.sessions)} ครั้ง</strong><small>รวมรายการชาร์จในช่วงวันที่เลือก</small></div><div><span>จำนวนผู้ใช้งาน</span><strong>{formatNumber(data.kpis.uniqueCustomers)} คน</strong><small>จำนวนผู้ใช้งานไม่ซ้ำ</small></div><div><span>พลังงานที่ให้บริการ</span><strong>{formatNumber(data.kpis.energyKwh, 2)} kWh</strong><small>ปริมาณการชาร์จรวมของสถานี</small></div><div><span>เวลาที่ใช้บริการ</span><strong>{formatNumber(data.kpis.averageDurationMinutes, 1)} นาที/ครั้ง</strong><small>ระยะเวลาชาร์จเฉลี่ย</small></div></div></section>
        <section className="panel partner-overview-trend-panel"><div className="decision-heading"><div><p className="section-label">USAGE TREND</p><h2>แนวโน้มปริมาณการชาร์จรายวัน</h2></div><span className="period-label">ปริมาณการชาร์จ (kWh)</span></div><div className="partner-overview-trend-chart">{(data.trend ?? []).map((row) => <div className="partner-overview-trend-column" key={row.date} title={`${row.date} · ${formatNumber(row.energyKwh, 2)} kWh`}><strong>{formatNumber(row.energyKwh, 0)}</strong><i style={{ height: `${Math.max(2, row.energyKwh / maxEnergy * 100)}%` }} /><span>{row.date.slice(8)}</span></div>)}</div><p className="chart-footnote">ใช้ดูการเปลี่ยนแปลงของปริมาณการชาร์จในแต่ละวันและช่วงที่มีความต้องการสูง</p></section>
        <section className="panel partner-method-panel"><p className="section-label">ข้อมูลประกอบ</p><p>{data.methodology?.energy}</p><p className="chart-footnote">อัปเดตข้อมูลล่าสุด {formatDateTime(data.imports?.lastImportAt)}</p></section>
      </>}
    </main>
  );
}

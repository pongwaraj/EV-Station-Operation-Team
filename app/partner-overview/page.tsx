"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { rangeLabel } from "../../lib/display-date";

type OverviewData = {
  message?: string;
  range?: { from: string; to: string };
  settlement?: { rateThbPerKwh: number; basis: string; status: string };
  kpis?: { sessions: number; meaningfulSessions: number; uniqueCustomers: number; energyKwh: number; eligibleEnergyKwh: number; partnerShareThb: number; averageKwhPerSession: number; averageDurationMinutes: number; shortSessions: number; shortSessionRate: number };
  trend?: Array<{ date: string; sessions: number; energyKwh: number; partnerShareThb: number }>;
  imports?: { lastImportAt: string | null };
  methodology?: { energy: string; partnerShare: string; note: string };
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "-";
}

export default function PartnerOverviewPage() {
  const [from, setFrom] = useState("2026-05-18");
  const [to, setTo] = useState("2026-09-16");
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
      <section className="hero compact-hero"><p className="eyebrow">PARTNER VIEW · OVERVIEW</p><h1>Partner Overview</h1><p className="lede">ภาพรวมคุณค่าของสถานี Meta Mall สำหรับผู้ให้เช่าพื้นที่ แสดง traffic, customer behavior ระดับรวม และ Partner Share โดยไม่เปิดเผยรายได้ของ TCE</p></section>
      <section className="partner-safe-banner"><span className="partner-safe-icon">✓</span><div><strong>Partner-safe view</strong><p>ไม่แสดงรายได้ของ TCE, อัตราค่าบริการภายใน, Customer ID, VIN หรือ Order Number · Partner Share คำนวณจาก kWh × 0.40 บาท</p></div></section>
      <section className="panel filter-panel"><form className="filter-form" onSubmit={submit}><label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="submit" disabled={loading}>อัปเดตภาพรวม</button></form><p className="hint drilldown-note">ข้อมูลที่แสดง: {data?.range ? rangeLabel(data.range) : `${from} – ${to}`}</p></section>
      {loading && <section className="panel loading-state"><p>กำลังสรุปภาพรวม partner…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void load(from, to)}>ลองใหม่</button></section>}
      {data?.kpis && !loading && !error && <>
        <section className="grid kpi-grid partner-overview-kpi-grid"><article className="card"><p className="card-label">จำนวนการชาร์จ</p><p className="kpi-value">{formatNumber(data.kpis.sessions)}<small> ครั้ง</small></p><p className="hint">Meaningful {formatNumber(data.kpis.meaningfulSessions)} ครั้ง</p></article><article className="card"><p className="card-label">ผู้ใช้งานไม่ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}<small> คน</small></p><p className="hint">นับจาก identifier ที่มีในระบบ</p></article><article className="card"><p className="card-label">หน่วยชาร์จรวม</p><p className="kpi-value">{formatNumber(data.kpis.energyKwh, 2)}<small> kWh</small></p><p className="hint">เฉลี่ย {formatNumber(data.kpis.averageKwhPerSession, 2)} kWh/ครั้ง</p></article><article className="card partner-share-card"><p className="card-label">Partner Share (ประมาณการ)</p><p className="kpi-value">{formatNumber(data.kpis.partnerShareThb, 2)}<small> บาท</small></p><p className="hint">{formatNumber(data.settlement?.rateThbPerKwh ?? 0, 2)} บาท/kWh · {formatNumber(data.kpis.eligibleEnergyKwh, 2)} kWh ที่เข้าเกณฑ์เบื้องต้น</p></article></section>
        <section className="panel partner-decision-panel"><p className="section-label">PARTNER READOUT</p><h2>ภาพรวมที่ใช้คุยกับผู้ให้เช่าพื้นที่</h2><div className="partner-decision-grid"><div><span>Traffic จากการชาร์จ</span><strong>{formatNumber(data.kpis.sessions)} ครั้ง</strong><small>ในช่วงเวลาที่เลือก</small></div><div><span>Customer reach</span><strong>{formatNumber(data.kpis.uniqueCustomers)} คน</strong><small>ผู้ใช้งานที่ระบุได้</small></div><div><span>คุณค่าต่อการใช้พื้นที่</span><strong>{formatNumber(data.kpis.energyKwh, 2)} kWh</strong><small>หน่วยชาร์จรวมที่สถานีส่งมอบ</small></div><div><span>คุณภาพข้อมูลเบื้องต้น</span><strong>{formatNumber(data.kpis.shortSessionRate, 1)}% สั้น</strong><small>{formatNumber(data.kpis.shortSessions)} รายการควรติดตาม</small></div></div></section>
        <section className="panel partner-overview-trend-panel"><div className="decision-heading"><div><p className="section-label">PARTNER VALUE TREND</p><h2>หน่วยชาร์จและ Partner Share รายวัน</h2></div><span className="period-label">kWh × {formatNumber(data.settlement?.rateThbPerKwh ?? 0, 2)} บาท</span></div><div className="partner-overview-trend-chart">{(data.trend ?? []).map((row) => <div className="partner-overview-trend-column" key={row.date} title={`${row.date} · ${formatNumber(row.energyKwh, 2)} kWh · Partner Share ${formatNumber(row.partnerShareThb, 2)} บาท`}><strong>{formatNumber(row.energyKwh, 0)}</strong><i style={{ height: `${Math.max(2, row.energyKwh / maxEnergy * 100)}%` }} /><span>{row.date.slice(8)}</span></div>)}</div><p className="chart-footnote">แสดงหน่วยชาร์จรวมและส่วนแบ่งตามอัตรา 0.40 บาท/kWh · ตัวเลขยังเป็น estimated จนกว่าจะยืนยันกติกา eligible session กับสัญญา</p></section>
        <section className="panel partner-method-panel"><p className="section-label">นิยามและสถานะข้อมูล</p><p>{data.methodology?.energy} · {data.methodology?.partnerShare}</p><p className="chart-footnote">{data.methodology?.note} · นำเข้าข้อมูลล่าสุด {formatDateTime(data.imports?.lastImportAt)}</p></section>
      </>}
    </main>
  );
}

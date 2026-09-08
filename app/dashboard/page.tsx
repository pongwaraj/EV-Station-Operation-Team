"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type DashboardData = {
  message?: string;
  kpis?: {
    sessions: number;
    energyKwh: number;
    revenueThb: number;
    uniqueCustomers: number;
    avgDurationMinutes: number;
    shortSessions: number;
    alarmEvents: number;
    alarmDurationMinutes: number;
  };
  trend?: Array<{ date: string; sessions: number; energyKwh: number; revenueThb: number; alarmEvents: number }>;
  peakHours?: Array<{ hour: number; sessions: number; energyKwh: number }>;
  imports?: { count: number; lastImportAt: string | null };
  quality?: Array<{ severity: string; count: number }>;
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00+07:00`));
}

export default function DashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    try {
      const response = await fetch(`/api/dashboard/overview?${query.toString()}`);
      const result = (await response.json()) as DashboardData;
      if (!response.ok) throw new Error(result.message ?? "ไม่สามารถอ่าน dashboard ได้");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ไม่สามารถอ่าน dashboard ได้");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const trendMax = useMemo(() => Math.max(...(data?.trend ?? []).map((item) => item.sessions), 1), [data]);
  const peak = useMemo(() => [...(data?.peakHours ?? [])].sort((a, b) => b.sessions - a.sessions)[0], [data]);

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <p className="eyebrow">TCE EV OPERATIONS / EXECUTIVE VIEW</p>
        <h1>Meta Mall Operations Overview</h1>
        <p className="lede">ภาพรวมประสิทธิภาพการใช้งาน สัญญาณผิดปกติ และแนวโน้มตามช่วงวันที่</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={loadDashboard}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit">อัปเดตภาพรวม</button>
        </form>
      </section>

      {loading && <section className="panel"><p>กำลังอ่านข้อมูลจาก Neon...</p></section>}
      {error && <section className="panel error-box"><strong>Dashboard ยังไม่พร้อม:</strong> {error}<p className="hint">ตรวจสอบ DATABASE_URL และรัน migration ก่อนใช้งานจริง</p></section>}

      {data?.kpis && (
        <>
          <section className="grid kpi-grid">
            <article className="card"><p className="card-label">Charging sessions</p><p className="kpi-value">{formatNumber(data.kpis.sessions)}</p></article>
            <article className="card"><p className="card-label">Energy delivered</p><p className="kpi-value">{formatNumber(data.kpis.energyKwh, 1)} <small>kWh</small></p></article>
            <article className="card"><p className="card-label">Revenue</p><p className="kpi-value">฿{formatNumber(data.kpis.revenueThb, 0)}</p></article>
            <article className="card"><p className="card-label">Unique customers</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}</p></article>
          </section>

          <section className="content-grid dashboard-panels">
            <article className="panel">
              <p className="section-label">Daily trend</p>
              <h2>ปริมาณการใช้งานและพลังงาน</h2>
              <div className="trend-list">
                {(data.trend ?? []).map((item) => <div className="trend-row" key={item.date}><span>{formatDate(item.date)}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, (item.sessions / trendMax) * 100)}%` }} /></div><strong>{item.sessions} sessions</strong><em>{item.energyKwh} kWh</em></div>)}
                {!data.trend?.length && <p className="hint">ยังไม่มีข้อมูลในช่วงวันที่เลือก</p>}
              </div>
            </article>
            <article className="panel">
              <p className="section-label">Experience signals</p>
              <h2>ประเด็นที่ควรติดตาม</h2>
              <div className="metric-list">
                <span>Average session <strong>{formatNumber(data.kpis.avgDurationMinutes, 1)} นาที</strong></span>
                <span>Short / abnormal sessions <strong>{formatNumber(data.kpis.shortSessions)}</strong></span>
                <span>Alarm events <strong>{formatNumber(data.kpis.alarmEvents)}</strong></span>
                <span>Alarm duration <strong>{formatNumber(data.kpis.alarmDurationMinutes, 1)} นาที</strong></span>
                <span>Peak hour <strong>{peak ? `${String(peak.hour).padStart(2, "0")}:00` : "-"}</strong></span>
              </div>
            </article>
          </section>

          <section className="content-grid dashboard-panels">
            <article className="panel">
              <p className="section-label">Data readiness</p>
              <h2>ความพร้อมของข้อมูล</h2>
              <div className="metric-list">
                <span>Completed imports <strong>{formatNumber(data.imports?.count ?? 0)}</strong></span>
                <span>Open data-quality issues <strong>{formatNumber((data.quality ?? []).reduce((sum, row) => sum + row.count, 0))}</strong></span>
                <span>Last import <strong>{data.imports?.lastImportAt ? new Date(data.imports.lastImportAt).toLocaleString("th-TH") : "-"}</strong></span>
              </div>
            </article>
            <article className="panel dark-panel">
              <p className="section-label">Management readout</p>
              <h2>ใช้ Dashboard นี้ตอบคำถามอะไร</h2>
              <p>ช่วงไหนมี demand สูง, session ผิดปกติเกิดมากน้อยเพียงใด, alarm กระทบประสบการณ์หรือไม่ และข้อมูลล่าสุดพร้อมใช้แค่ไหน</p>
            </article>
          </section>
        </>
      )}
    </main>
  );
}

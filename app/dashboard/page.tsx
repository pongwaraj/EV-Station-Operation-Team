"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type DashboardData = {
  message?: string;
  range?: { from: string; to: string };
  kpis?: {
    sessions: number;
    energyKwh: number;
    averageEnergyPerSession: number;
    revenueThb: number;
    uniqueCustomers: number;
    avgDurationMinutes: number;
    shortSessions: number;
    shortSessionRate: number;
    alarmEvents: number;
    alarmDurationMinutes: number;
    alarmRate: number;
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

function formatIsoDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatInputDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function DashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (start) query.set("from", start);
    if (end) query.set("to", end);
    try {
      const response = await fetch(`/api/dashboard/overview?${query.toString()}`);
      const result = (await response.json()) as DashboardData;
      if (!response.ok) throw new Error(result.message ?? "dashboard unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load dashboard", loadError);
      setError("ขณะนี้ยังไม่สามารถแสดงข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    await fetchDashboard(from, to);
  }, [fetchDashboard, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchDashboard("", ""); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDashboard]);

  const trendMax = useMemo(() => Math.max(...(data?.trend ?? []).map((item) => item.sessions), 1), [data]);
  const peak = useMemo(() => [...(data?.peakHours ?? [])].sort((a, b) => b.sessions - a.sessions)[0], [data]);
  const abnormalSessionsHref = useMemo(() => {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const suffix = query.toString();
    return `/abnormal-sessions${suffix ? `?${suffix}` : ""}`;
  }, [from, to]);

  function setDatePreset(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    setFrom(formatInputDate(start));
    setTo(formatInputDate(end));
  }

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <p className="eyebrow">TCE CHARGEX</p>
        <h1>ภาพรวมสถานี Meta Mall</h1>
        <p className="lede">ติดตามการใช้งาน ประสิทธิภาพการชาร์จ และสัญญาณที่ควรดูแลในช่วงวันที่เลือก</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={loadDashboard}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit">อัปเดตภาพรวม</button>
        </form>
        <div className="preset-row" aria-label="ช่วงเวลาที่เลือกได้">
          <span>เลือกช่วงย้อนหลัง แล้วกดอัปเดตภาพรวม</span>
          {[7, 30, 90].map((days) => <button className="preset-button" key={days} type="button" onClick={() => setDatePreset(days)}>{days} วัน</button>)}
        </div>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังโหลดข้อมูล…</p></section>}
      {error && (
        <section className="panel error-state" role="alert">
          <strong>{error}</strong>
          <p className="hint">ลองใหม่อีกครั้ง หรือแจ้งทีมดูแลระบบหากยังพบปัญหา</p>
          <button type="button" onClick={() => void loadDashboard()}>ลองใหม่</button>
        </section>
      )}

      {data?.kpis && (
        <>
          <section className="grid kpi-grid">
            <article className="card"><p className="card-label">จำนวนการชาร์จ</p><p className="kpi-value">{formatNumber(data.kpis.sessions)}</p></article>
            <article className="card"><p className="card-label">พลังงานที่จ่าย</p><p className="kpi-value">{formatNumber(data.kpis.energyKwh, 1)} <small>kWh</small></p></article>
            <article className="card"><p className="card-label">รายได้จากการชาร์จ</p><p className="kpi-value">฿{formatNumber(data.kpis.revenueThb, 0)}</p></article>
            <article className="card"><p className="card-label">ลูกค้าที่ใช้งาน</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}</p></article>
          </section>

          <section className="content-grid dashboard-panels">
            <article className="panel">
              <p className="section-label">แนวโน้มรายวัน</p>
              <h2>ปริมาณการใช้งานและพลังงาน</h2>
              <div className="trend-list">
                {(data.trend ?? []).map((item) => <div className="trend-row" key={item.date}><span>{formatDate(item.date)}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, (item.sessions / trendMax) * 100)}%` }} /></div><strong>{formatNumber(item.sessions)} ครั้ง</strong><em>{formatNumber(item.energyKwh, 1)} kWh</em></div>)}
                {!data.trend?.length && <p className="hint">ยังไม่มีข้อมูลในช่วงวันที่เลือก</p>}
              </div>
            </article>
            <article className="panel">
              <p className="section-label">สัญญาณประสบการณ์ใช้งาน</p>
              <h2>ประเด็นที่ควรติดตาม</h2>
              <div className="metric-list">
                <span>ระยะเวลาชาร์จเฉลี่ย <strong>{formatNumber(data.kpis.avgDurationMinutes, 1)} นาที</strong></span>
                <Link className="metric-action" href={abnormalSessionsHref}>การชาร์จสั้นผิดปกติ <strong>{formatNumber(data.kpis.shortSessions)}</strong><small>ดู recovery / retry</small></Link>
                <span>เหตุการณ์ Alarm <strong>{formatNumber(data.kpis.alarmEvents)}</strong></span>
                <span>ระยะเวลา Alarm <strong>{formatNumber(data.kpis.alarmDurationMinutes, 1)} นาที</strong></span>
                <span>ช่วงเวลาที่ใช้งานสูงสุด <strong>{peak ? `${String(peak.hour).padStart(2, "0")}:00 น.` : "-"}</strong></span>
              </div>
            </article>
          </section>

          <section className="panel decision-panel">
            <div className="decision-heading">
              <div>
                <p className="section-label">ตัวชี้วัดเพื่อการตัดสินใจ</p>
                <h2>สัญญาณที่ควรติดตาม</h2>
              </div>
              <span className="period-label">{data.range ? `${formatIsoDate(data.range.from)} — ${formatIsoDate(data.range.to)}` : "ช่วงเวลาที่เลือก"}</span>
            </div>
            <div className="decision-grid">
              <Link className="decision-metric decision-link" href={abnormalSessionsHref}><span>การชาร์จสั้นผิดปกติ</span><strong>{formatNumber(data.kpis.shortSessionRate, 1)}%</strong><small>{formatNumber(data.kpis.shortSessions)} ครั้งจากทั้งหมด · ดูรายละเอียด</small></Link>
              <div className="decision-metric"><span>พลังงานเฉลี่ยต่อครั้ง</span><strong>{formatNumber(data.kpis.averageEnergyPerSession, 2)} kWh</strong><small>ใช้ดูคุณภาพและขนาดการใช้งาน</small></div>
              <div className="decision-metric"><span>Alarm ต่อการชาร์จ</span><strong>{formatNumber(data.kpis.alarmRate, 1)}%</strong><small>{formatNumber(data.kpis.alarmEvents)} เหตุการณ์ในช่วงเวลา</small></div>
            </div>
          </section>

          <section className="content-grid dashboard-panels">
            <article className="panel">
              <p className="section-label">ความพร้อมของข้อมูล</p>
              <h2>ความพร้อมของข้อมูล</h2>
              <div className="metric-list">
                <span>ชุดข้อมูลที่นำเข้าแล้ว <strong>{formatNumber(data.imports?.count ?? 0)}</strong></span>
                <span>รายการที่ควรตรวจสอบ <strong>{formatNumber((data.quality ?? []).reduce((sum, row) => sum + row.count, 0))}</strong></span>
                <span>อัปเดตข้อมูลล่าสุด <strong>{data.imports?.lastImportAt ? new Date(data.imports.lastImportAt).toLocaleString("th-TH") : "-"}</strong></span>
              </div>
            </article>
            <article className="panel dark-panel">
              <p className="section-label">สรุปสำหรับผู้บริหาร</p>
              <h2>ประเด็นที่ควรติดตาม</h2>
              <p>ดูช่วงเวลาที่มีการใช้งานสูง การชาร์จสั้นผิดปกติ เหตุการณ์ Alarm และความพร้อมของข้อมูล เพื่อวางแผนดูแลสถานีได้เร็วขึ้น</p>
            </article>
          </section>
        </>
      )}

      {!loading && !error && !data?.kpis && (
        <section className="panel empty-state">
          <p className="section-label">ยังไม่มีข้อมูล</p>
          <h2>ยังไม่มีข้อมูลในช่วงเวลานี้</h2>
          <p className="hint">เลือกช่วงวันที่ใหม่ หรือนำเข้าข้อมูลสถานีเพื่อเริ่มดูภาพรวม</p>
          <a className="action-link" href="/imports">ไปนำเข้าข้อมูล</a>
        </section>
      )}

      {data?.imports?.lastImportAt && !error && (
        <p className="freshness-row">อัปเดตข้อมูลล่าสุด {new Date(data.imports.lastImportAt).toLocaleString("th-TH")}</p>
      )}
    </main>
  );
}

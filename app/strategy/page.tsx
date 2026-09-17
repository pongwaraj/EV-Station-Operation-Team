"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";
const TARGET_UTILIZATION = 15;

type UtilizationTrend = { date: string; sessions: number; energyKwh: number; occupiedHours: number; capacityHours: number; utilization: number; headroom: number };
type UtilizationData = { message?: string; range?: { from: string; to: string }; station?: { utilization: number; headroom: number; chargerCount: number; connectorCount: number; sessions: number; occupiedHours: number; capacityHours: number }; trend?: UtilizationTrend[] };
type RetentionMonthly = { month: string; uniqueCustomers: number; meaningfulCustomers: number; newCustomers: number; returningCustomers: number; repeatCustomers: number; regularCustomers: number; repeatRate: number; regularRate: number };
type RetentionData = { message?: string; range?: { from: string; to: string }; monthly?: RetentionMonthly[]; kpis?: { uniqueCustomers: number; averageRepeatRate: number; averageRegularCustomers: number; activeRegularCustomers: number; atRiskRegularCustomers: number; lapsedRegularCustomers: number; regularLapseRate: number; medianExpectedGapDays: number } };
type OverviewData = { peakHours?: Array<{ hour: number; sessions: number; energyKwh: number }> };
type StrategyData = { utilization: UtilizationData; retention: RetentionData; overview: OverviewData };

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatInputDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}-01T00:00:00+07:00`));
}

function dateKeys(from: string, to: string) {
  const keys: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export default function StrategyPage() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [data, setData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStrategy = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const query = `from=${start}&to=${end}`;
      const [utilizationResponse, retentionResponse, overviewResponse] = await Promise.all([
        fetch(`/api/dashboard/utilization?${query}`, { cache: "no-store" }),
        fetch(`/api/dashboard/retention?${query}`, { cache: "no-store" }),
        fetch(`/api/dashboard/overview?${query}`, { cache: "no-store" }),
      ]);
      const utilization = await utilizationResponse.json() as UtilizationData;
      const retention = await retentionResponse.json() as RetentionData;
      const overview = overviewResponse.ok ? await overviewResponse.json() as OverviewData : {};
      if (!utilizationResponse.ok) throw new Error(utilization.message ?? "utilization unavailable");
      if (!retentionResponse.ok) throw new Error(retention.message ?? "retention unavailable");
      setData({ utilization, retention, overview });
    } catch (loadError) {
      console.error("Unable to load strategy analysis", loadError);
      setError("ยังไม่สามารถแสดงบทวิเคราะห์เชิงกลยุทธ์ได้ กรุณาตรวจสอบการเชื่อมต่อข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStrategy(DEFAULT_FROM, DEFAULT_TO); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStrategy]);

  const utilization = data?.utilization.station;
  const retention = data?.retention.kpis;
  const monthly = data?.retention.monthly ?? [];
  const dailyTrend = useMemo(() => data?.utilization.trend ?? [], [data]);
  const maxDailyUtilization = useMemo(() => Math.max(...dailyTrend.map((row) => row.utilization), 1), [dailyTrend]);
  const peakHour = useMemo(() => [...(data?.overview.peakHours ?? [])].sort((a, b) => b.sessions - a.sessions)[0], [data]);
  const newCustomers = monthly.reduce((sum, row) => sum + row.newCustomers, 0);
  const returningCustomers = monthly.reduce((sum, row) => sum + row.returningCustomers, 0);
  const totalMonthlyCustomers = monthly.reduce((sum, row) => sum + row.meaningfulCustomers, 0);
  const returningRate = totalMonthlyCustomers ? (returningCustomers / totalMonthlyCustomers) * 100 : 0;
  const belowTenDays = dailyTrend.filter((row) => row.utilization < 10).length;
  const aboveTargetDays = dailyTrend.filter((row) => row.utilization >= TARGET_UTILIZATION).length;
  const strategyState = (utilization?.utilization ?? 0) < 10 ? "สร้างฐานลูกค้า" : (utilization?.utilization ?? 0) < TARGET_UTILIZATION ? "เร่งการกลับมาใช้ซ้ำ" : "ขยายรายได้";

  const dailyRows = useMemo(() => {
    if (!data?.utilization.range || !utilization) return [];
    const fromDate = formatInputDate(data.utilization.range.from);
    const toDate = formatInputDate(data.utilization.range.to);
    const byDate = new Map(dailyTrend.map((row) => [row.date, row]));
    return dateKeys(fromDate, toDate).map((date) => {
      const row = byDate.get(date);
      const dayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
      return { date, dayIndex, dayOfMonth: Number(date.slice(8)), sessions: row?.sessions ?? 0, energyKwh: row?.energyKwh ?? 0, occupiedHours: row?.occupiedHours ?? 0, capacityHours: utilization.connectorCount * 24, utilization: row?.utilization ?? 0 };
    });
  }, [data, dailyTrend, utilization]);

  const weekdayPatterns = useMemo(() => {
    const labels = [{ index: 1, label: "จันทร์" }, { index: 2, label: "อังคาร" }, { index: 3, label: "พุธ" }, { index: 4, label: "พฤหัสบดี" }, { index: 5, label: "ศุกร์" }, { index: 6, label: "เสาร์" }, { index: 0, label: "อาทิตย์" }];
    return labels.map(({ index, label }) => {
      const rows = dailyRows.filter((row) => row.dayIndex === index);
      const capacityHours = rows.reduce((sum, row) => sum + row.capacityHours, 0);
      const occupiedHours = rows.reduce((sum, row) => sum + row.occupiedHours, 0);
      return { label, days: rows.length, averageSessions: rows.length ? rows.reduce((sum, row) => sum + row.sessions, 0) / rows.length : 0, averageEnergyKwh: rows.length ? rows.reduce((sum, row) => sum + row.energyKwh, 0) / rows.length : 0, averageUtilization: capacityHours ? (occupiedHours / capacityHours) * 100 : 0 };
    });
  }, [dailyRows]);

  const monthPhasePatterns = useMemo(() => {
    const phases = [{ key: "early", label: "ต้นเดือน", test: (day: number) => day <= 10 }, { key: "middle", label: "กลางเดือน", test: (day: number) => day >= 11 && day <= 20 }, { key: "late", label: "ปลายเดือน", test: (day: number) => day >= 21 }];
    return phases.map(({ key, label, test }) => {
      const rows = dailyRows.filter((row) => test(row.dayOfMonth));
      const capacityHours = rows.reduce((sum, row) => sum + row.capacityHours, 0);
      const occupiedHours = rows.reduce((sum, row) => sum + row.occupiedHours, 0);
      return { key, label, days: rows.length, averageSessions: rows.length ? rows.reduce((sum, row) => sum + row.sessions, 0) / rows.length : 0, averageEnergyKwh: rows.length ? rows.reduce((sum, row) => sum + row.energyKwh, 0) / rows.length : 0, averageUtilization: capacityHours ? (occupiedHours / capacityHours) * 100 : 0 };
    });
  }, [dailyRows]);

  const highestWeekday = useMemo(() => [...weekdayPatterns].sort((a, b) => b.averageSessions - a.averageSessions)[0], [weekdayPatterns]);
  const lowestWeekday = useMemo(() => [...weekdayPatterns].sort((a, b) => a.averageSessions - b.averageSessions)[0], [weekdayPatterns]);
  const highestMonthPhase = useMemo(() => [...monthPhasePatterns].sort((a, b) => b.averageSessions - a.averageSessions)[0], [monthPhasePatterns]);
  const lowestMonthPhase = useMemo(() => [...monthPhasePatterns].sort((a, b) => a.averageSessions - b.averageSessions)[0], [monthPhasePatterns]);
  const maxWeekdaySessions = useMemo(() => Math.max(...weekdayPatterns.map((row) => row.averageSessions), 1), [weekdayPatterns]);
  const hourlyPatterns = useMemo(() => {
    const totalDays = Math.max(1, dailyRows.length);
    const byHour = new Map((data?.overview.peakHours ?? []).map((row) => [row.hour, row]));
    return Array.from({ length: 24 }, (_, hour) => {
      const row = byHour.get(hour);
      return { hour, sessions: row?.sessions ?? 0, energyKwh: row?.energyKwh ?? 0, averageSessions: (row?.sessions ?? 0) / totalDays, averageEnergyKwh: (row?.energyKwh ?? 0) / totalDays };
    });
  }, [data, dailyRows]);
  const topHourly = useMemo(() => [...hourlyPatterns].sort((a, b) => b.sessions - a.sessions).slice(0, 3), [hourlyPatterns]);
  const lowHourly = useMemo(() => [...hourlyPatterns].sort((a, b) => a.sessions - b.sessions).slice(0, 3), [hourlyPatterns]);
  const maxHourlySessions = useMemo(() => Math.max(...hourlyPatterns.map((row) => row.sessions), 1), [hourlyPatterns]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadStrategy(from, to);
  }

  function setDatePreset(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    setFrom(formatInputDate(start));
    setTo(formatInputDate(end));
  }

  return (
    <main className="shell strategy-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">EXECUTIVE STRATEGY</p>
        <h1>กลยุทธ์การเติบโตของสถานี</h1>
        <p className="lede">เปลี่ยนข้อมูล utilization และพฤติกรรมลูกค้าให้เป็นจังหวะตัดสินใจ: ควรดึงลูกค้าใหม่ กระตุ้นการกลับมาซ้ำ หรือเร่งรายได้จากฐานเดิม</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตบทวิเคราะห์</button>
        </form>
        <div className="preset-row"><span>ช่วงเริ่มต้นหลังเปลี่ยนแพลตฟอร์ม</span>{[7, 30, 90].map((days) => <button className="preset-button" key={days} type="button" onClick={() => setDatePreset(days)}>{days} วัน</button>)}</div>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังสรุปสัญญาณเพื่อการตัดสินใจ…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void loadStrategy(from, to)}>ลองใหม่</button></section>}

      {data && utilization && retention && !loading && !error && (
        <>
          <p className="loaded-period">ข้อมูลที่แสดง: {data.utilization.range ? `${formatDate(data.utilization.range.from)} – ${formatDate(data.utilization.range.to)}` : "-"}</p>

          <section className="strategy-state-panel">
            <div><p className="section-label">DECISION SIGNAL</p><h2>สถานีอยู่ในโหมด “{strategyState}”</h2><p>{utilization.utilization < 10 ? "Utilization ยังต่ำกว่า 10% จึงควรเน้นสร้าง demand ใหม่และเพิ่มการมองเห็นสถานี" : utilization.utilization < TARGET_UTILIZATION ? "Utilization ผ่าน 10% แล้ว แต่ยังห่างจากระดับอ้างอิง 15% ควรเน้นให้ลูกค้าเดิมกลับมาใช้ซ้ำสม่ำเสมอ" : "Utilization แตะระดับอ้างอิงแล้ว ควรพิจารณาเพิ่มรายได้ต่อ session และขยาย capacity อย่างระมัดระวัง"}</p></div><div className="strategy-state-score"><strong>{formatNumber(utilization.utilization, 1)}%</strong><span>station utilization</span><small>เป้าหมายอ้างอิง {TARGET_UTILIZATION}% · ขาดอีก {formatNumber(Math.max(0, TARGET_UTILIZATION - utilization.utilization), 1)} จุด</small></div>
          </section>

          <section className="grid kpi-grid strategy-kpi-grid">
            <article className="card"><p className="card-label">Utilization</p><p className="kpi-value">{formatNumber(utilization.utilization, 1)}<small>%</small></p><p className="hint">{formatNumber(belowTenDays)} วันจาก {formatNumber(dailyTrend.length)} วันที่ยังต่ำกว่า 10%</p></article>
            <article className="card"><p className="card-label">ลูกค้าใหม่ในช่วงที่เลือก</p><p className="kpi-value">{formatNumber(newCustomers)} <small>คน</small></p><p className="hint">ใช้วัดผลแคมเปญ acquisition</p></article>
            <article className="card"><p className="card-label">สัดส่วนลูกค้าที่กลับมา</p><p className="kpi-value">{formatNumber(returningRate, 1)}<small>%</small></p><p className="hint">จาก monthly customer observations</p></article>
            <article className="card"><p className="card-label">กลุ่มที่ควรทำ CRM</p><p className="kpi-value">{formatNumber(retention.atRiskRegularCustomers + retention.lapsedRegularCustomers)} <small>คน</small></p><p className="hint">At risk {formatNumber(retention.atRiskRegularCustomers)} · Lapsed {formatNumber(retention.lapsedRegularCustomers)}</p></article>
          </section>

          <section className="content-grid strategy-main-grid">
            <article className="panel">
              <div className="strategy-section-heading"><div><p className="section-label">UTILIZATION MOMENTUM</p><h2>แนวโน้ม utilization รายวัน</h2></div><span className="strategy-legend"><i className="strategy-target-key" /> 10% baseline <i className="strategy-goal-key" /> 15% target</span></div>
              <div className="strategy-trend-chart" role="img" aria-label="กราฟ utilization รายวันพร้อมเส้นเกณฑ์ 10 และ 15 เปอร์เซ็นต์"><div className="strategy-target-line baseline" style={{ bottom: `${Math.min(100, (10 / maxDailyUtilization) * 100)}%` }}><span>10%</span></div><div className="strategy-target-line goal" style={{ bottom: `${Math.min(100, (TARGET_UTILIZATION / maxDailyUtilization) * 100)}%` }}><span>15%</span></div>{dailyTrend.map((row) => <div className="strategy-trend-column" key={row.date} title={`${row.date} · ${formatNumber(row.utilization, 1)}%`}><div className="strategy-trend-bar" style={{ height: `${Math.max(3, (row.utilization / maxDailyUtilization) * 100)}%` }} /><span>{row.date.slice(8)}</span></div>)}</div>
              <div className="strategy-trend-summary"><span>วันที่แตะเป้าหมาย 15% <strong>{formatNumber(aboveTargetDays)} วัน</strong></span><span>หัวชาร์จ <strong>{formatNumber(utilization.connectorCount)} หัว</strong></span><span>Headroom <strong>{formatNumber(utilization.headroom, 1)}%</strong></span></div>
            </article>

            <article className="panel strategy-recommendation-panel"><p className="section-label">EXECUTIVE ACTION</p><h2>ข้อเสนอแนะสำหรับรอบถัดไป</h2><div className="strategy-action-list"><div><span>01 · เป้าหมายหลัก</span><strong>{utilization.utilization < 10 ? "ดึงลูกค้าใหม่เข้าสถานี" : "เปลี่ยนผู้ใช้ครั้งแรกให้เป็นลูกค้าซ้ำ"}</strong><small>{utilization.utilization < 10 ? "ทำ awareness, partner และ location campaign" : `ใช้รอบ CRM ประมาณทุก ${formatNumber(retention.medianExpectedGapDays, 1)} วัน`}</small></div><div><span>02 · กลุ่มเป้าหมาย</span><strong>{utilization.utilization < 10 ? `${formatNumber(newCustomers)} ลูกค้าใหม่ที่เข้ามาในช่วงนี้` : `${formatNumber(retention.atRiskRegularCustomers)} At risk + ${formatNumber(retention.lapsedRegularCustomers)} Lapsed`}</strong><small>{utilization.utilization < 10 ? "วัด conversion เป็นการชาร์จครั้งที่ 2" : "ทำ win-back และ reminder แบบเฉพาะกลุ่ม"}</small></div><div><span>03 · จังหวะทำแคมเปญ</span><strong>{peakHour ? `ช่วงพีกปัจจุบัน ${String(peakHour.hour).padStart(2, "0")}:00 น.` : "รอข้อมูลช่วงเวลา"}</strong><small>ทดลองข้อเสนอในช่วงนอกพีก เพื่อเพิ่ม utilization โดยไม่แย่ง capacity ช่วง demand สูง</small></div></div></article>
          </section>

          <section className="panel strategy-monthly-panel"><div className="strategy-section-heading"><div><p className="section-label">MONTHLY GROWTH MIX</p><h2>การเติบโตมาจากลูกค้าใหม่หรือการกลับมาใช้ซ้ำ</h2></div><span className="hint">ใช้เลือกน้ำหนักระหว่าง Acquisition และ Retention</span></div><div className="strategy-monthly-grid">{monthly.map((row) => <article key={row.month}><strong>{formatMonth(row.month)}</strong><div className="strategy-monthly-bar"><i className="new" style={{ width: `${row.meaningfulCustomers ? (row.newCustomers / row.meaningfulCustomers) * 100 : 0}%` }} /><i className="returning" style={{ width: `${row.meaningfulCustomers ? (row.returningCustomers / row.meaningfulCustomers) * 100 : 0}%` }} /></div><div><span className="strategy-mix-new">ใหม่ {formatNumber(row.newCustomers)}</span><span className="strategy-mix-returning">กลับมา {formatNumber(row.returningCustomers)}</span></div><small>Meaningful customers {formatNumber(row.meaningfulCustomers)} · Repeat {formatNumber(row.repeatRate, 1)}% · Regular {formatNumber(row.regularRate, 1)}%</small></article>)}</div></section>

          <section className="content-grid strategy-pattern-grid">
            <article className="panel">
              <div className="strategy-section-heading"><div><p className="section-label">WEEKDAY PATTERN</p><h2>ค่าเฉลี่ยการชาร์จ จันทร์–อาทิตย์</h2></div><span className="hint">เฉลี่ยต่อวันในแต่ละวันของสัปดาห์</span></div>
              <div className="strategy-weekday-list">{weekdayPatterns.map((row) => <div className="strategy-weekday-row" key={row.label}><strong>{row.label}</strong><div className="strategy-weekday-bar"><i style={{ width: `${(row.averageSessions / maxWeekdaySessions) * 100}%` }} /></div><span>{formatNumber(row.averageSessions, 1)} ครั้ง/วัน</span><span>{formatNumber(row.averageEnergyKwh, 1)} kWh/วัน</span><small>{formatNumber(row.averageUtilization, 1)}% · {formatNumber(row.days)} วัน</small></div>)}</div>
              <p className="chart-footnote">วันสูงสุด: {highestWeekday?.label ?? "-"} ({formatNumber(highestWeekday?.averageSessions ?? 0, 1)} ครั้ง/วัน) · วันต่ำสุด: {lowestWeekday?.label ?? "-"} ({formatNumber(lowestWeekday?.averageSessions ?? 0, 1)} ครั้ง/วัน)</p>
            </article>

            <article className="panel strategy-phase-panel">
              <div className="strategy-section-heading"><div><p className="section-label">MONTH PHASE PATTERN</p><h2>ต้นเดือน / กลางเดือน / ปลายเดือน</h2></div><span className="hint">ดูว่าจังหวะเงินเดือนหรือวันเดินทางมีผลหรือไม่</span></div>
              <div className="strategy-phase-grid">{monthPhasePatterns.map((row) => <div key={row.key}><strong>{row.label}</strong><span>{formatNumber(row.averageSessions, 1)} ครั้ง/วัน</span><small>{formatNumber(row.averageEnergyKwh, 1)} kWh/วัน · Utilization {formatNumber(row.averageUtilization, 1)}%</small><em>{formatNumber(row.days)} วันในตัวอย่าง</em></div>)}</div>
              <div className="strategy-pattern-insight"><span>สัญญาณเพื่อวางแผน</span><strong>{highestMonthPhase?.label ?? "-"} มีค่าเฉลี่ยสูงสุด</strong><small>ต่ำสุดคือ {lowestMonthPhase?.label ?? "-"} · ควรทดสอบแคมเปญต่างกันตามช่วงเดือนและวัดผลแบบเทียบวันในสัปดาห์</small></div>
            </article>
          </section>

          <section className="panel strategy-hourly-panel">
            <div className="strategy-section-heading"><div><p className="section-label">HOURLY DEMAND PATTERN</p><h2>ค่าเฉลี่ยการชาร์จรายชั่วโมง</h2></div><span className="hint">แสดง session ที่เริ่มในแต่ละชั่วโมง เฉลี่ยต่อวันของช่วงที่เลือก</span></div>
            <div className="strategy-hourly-chart" role="img" aria-label="กราฟจำนวน session ตามชั่วโมง"><div className="strategy-hourly-gridline" /><div className="strategy-hourly-gridline middle" />{hourlyPatterns.map((row) => <div className="strategy-hourly-column" key={row.hour} title={`${String(row.hour).padStart(2, "0")}:00 · ${formatNumber(row.sessions)} sessions · เฉลี่ย ${formatNumber(row.averageSessions, 1)} ครั้ง/วัน · ${formatNumber(row.energyKwh, 1)} kWh`}><div className={`strategy-hourly-bar ${row.hour === topHourly[0]?.hour ? "peak" : ""}`} style={{ height: `${Math.max(2, (row.sessions / maxHourlySessions) * 100)}%` }} /><span>{row.hour % 2 === 0 ? String(row.hour).padStart(2, "0") : ""}</span></div>)}</div>
            <div className="strategy-hourly-summary"><div><span>Peak hours</span><strong>{topHourly.map((row) => `${String(row.hour).padStart(2, "0")}:00`).join(" · ")}</strong><small>เฉลี่ยรวม {formatNumber(topHourly.reduce((sum, row) => sum + row.averageSessions, 0), 1)} ครั้ง/วันใน 3 ชั่วโมงสูงสุด</small></div><div><span>Low-load hours</span><strong>{lowHourly.map((row) => `${String(row.hour).padStart(2, "0")}:00`).join(" · ")}</strong><small>เหมาะสำหรับทดสอบ offer เพื่อดึง demand เพิ่ม</small></div><div><span>คำแนะนำ</span><strong>ทำแคมเปญช่วง Low-load</strong><small>หลีกเลี่ยงการลดราคาใน Peak hours และวัดผลด้วย session/hour + kWh/hour</small></div></div>
          </section>

          <section className="panel strategy-playbook-panel"><p className="section-label">CAMPAIGN PLAYBOOK</p><h2>กรอบแคมเปญที่ผู้บริหารใช้ตัดสินใจได้</h2><div className="strategy-playbook-grid"><div className={utilization.utilization < 10 ? "priority" : ""}><span>Acquisition</span><strong>ดึงลูกค้าใหม่</strong><p>เหมาะเมื่อ utilization ต่ำกว่า 10% ใช้พันธมิตรในพื้นที่, ป้ายทางเข้า, map visibility และ offer สำหรับการชาร์จครั้งแรก</p><small>Success metric: New customer และ First-to-second charge conversion</small></div><div className={utilization.utilization >= 10 && utilization.utilization < TARGET_UTILIZATION ? "priority" : ""}><span>Retention</span><strong>กระตุ้นการกลับมาซ้ำ</strong><p>เหมาะกับสถานีที่เริ่มผ่าน 10% ใช้ reminder ตามรอบ 5 วัน, reward ครั้งที่ 2 และ win-back สำหรับ At risk/Lapsed</p><small>Success metric: Repeat rate, Regular customers และ Lapse rate</small></div><div className={utilization.utilization >= TARGET_UTILIZATION ? "priority" : ""}><span>Monetization</span><strong>เพิ่มรายได้ต่อ capacity</strong><p>เมื่อ utilization แตะ 15% ให้ทดสอบราคา/แพ็กเกจช่วงนอกพีก และพิจารณา capacity เพิ่มเมื่อ demand สม่ำเสมอ</p><small>Success metric: kWh/session, Revenue/connector-hour และ queue risk</small></div></div></section>

          <section className="panel strategy-method-panel"><p className="section-label">วิธีอ่านหน้านี้</p><p className="hint">Utilization ใช้เวลาที่หัวชาร์จถูกใช้งานจริงเทียบกับ capacity ของหัวชาร์จทั้งหมด · 10% เป็น baseline เชิงตลาดไทยจากข้อมูล กกพ. · 15% ใช้เป็นเป้าหมายอ้างอิงด้านความเป็นไปได้ทางธุรกิจ ไม่ใช่เกณฑ์รับรองกำไร · ลูกค้าใหม่/ลูกค้ากลับมาใช้ซ้ำวัดจาก Customer ID ที่ระบบมี</p></section>
        </>
      )}
    </main>
  );
}

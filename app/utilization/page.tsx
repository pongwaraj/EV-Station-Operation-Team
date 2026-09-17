"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type UtilizationRow = {
  id: string | null;
  chargerId?: string;
  chargerName?: string;
  connectorName?: string;
  connectorNo?: number;
  name?: string;
  status: string;
  statusGroup: "online" | "offline" | "unknown";
  powerKw: number;
  connectorCount?: number;
  sessions: number;
  energyKwh: number;
  occupiedHours: number;
  capacityHours: number;
  headroomHours: number;
  utilization: number;
  headroom: number;
  overlapDetected: boolean;
  availability?: {
    availableHours: number;
    coverageHours: number;
    coverage: number;
    uptime: number | null;
    utilization: number;
    headroom: number;
  } | null;
};

type UtilizationTrend = UtilizationRow & { date: string };

type UtilizationData = {
  message?: string;
  range?: { from: string; to: string };
  definition?: { utilization: string; headroom: string; capacity: string; limitation: string };
  station?: UtilizationRow & { name: string; chargerCount: number; connectorCount: number; statusCounts: { online: number; offline: number; unknown: number } };
  chargers?: UtilizationRow[];
  connectors?: UtilizationRow[];
  trend?: UtilizationTrend[];
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatInputDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T00:00:00+07:00`));
}

function statusLabel(value: UtilizationRow["statusGroup"]) {
  return value === "online" ? "Online" : value === "offline" ? "Offline" : "ไม่ระบุ";
}

function statusClass(value: UtilizationRow["statusGroup"]) {
  return `utilization-status ${value}`;
}

function gaugeClass(value: number) {
  return value >= 80 ? "high" : value >= 50 ? "medium" : "low";
}

export default function UtilizationPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<UtilizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUtilization = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (start) query.set("from", start);
      if (end) query.set("to", end);
      const response = await fetch(`/api/dashboard/utilization?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as UtilizationData;
      if (!response.ok) throw new Error(result.message ?? "utilization unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load utilization analysis", loadError);
      setError("ยังไม่สามารถแสดง utilization ได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchUtilization("", ""); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchUtilization]);

  const effectiveFrom = from || (data?.range ? formatInputDate(data.range.from) : "");
  const effectiveTo = to || (data?.range ? formatInputDate(data.range.to) : "");
  const trendMax = useMemo(() => Math.max(...(data?.trend ?? []).map((row) => row.utilization), 1), [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void fetchUtilization(effectiveFrom, effectiveTo);
  }

  function setDatePreset(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    setFrom(formatInputDate(start));
    setTo(formatInputDate(end));
  }

  return (
    <main className="shell utilization-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">STATION UTILIZATION</p>
        <h1>Utilization & Headroom</h1>
        <p className="lede">ดูภาพรวมกำลังการให้บริการของ Meta Mall และเจาะลงไปถึงรายตู้และรายหัวชาร์จ เพื่อเห็นว่าความสามารถในการรองรับการใช้งานยังเหลือเท่าไร</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={effectiveFrom} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={effectiveTo} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดต utilization</button>
        </form>
        <div className="preset-row" aria-label="ช่วงเวลาที่เลือกได้">
          <span>เลือกช่วงย้อนหลัง แล้วกดอัปเดต</span>
          {[7, 30, 90].map((days) => <button className="preset-button" key={days} type="button" onClick={() => setDatePreset(days)}>{days} วัน</button>)}
        </div>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังคำนวณ utilization และ headroom…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void fetchUtilization(effectiveFrom, effectiveTo)}>ลองใหม่</button></section>}

      {data?.station && !loading && !error && (
        <>
          <p className="loaded-period">ข้อมูลที่แสดง: {data.range ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : "-"}</p>

          <section className="grid kpi-grid utilization-kpi-grid">
            <article className="card"><p className="card-label">Calendar utilization</p><p className="kpi-value">{formatNumber(data.station.utilization, 1)}<small>%</small></p><p className="hint">เทียบกับ capacity ของหัวชาร์จตลอดช่วงเวลาที่เลือก</p></article>
            <article className="card"><p className="card-label">Available-time utilization</p><p className="kpi-value">{data.station.availability ? <>{formatNumber(data.station.availability.utilization, 1)}<small>%</small></> : "—"}</p><p className="hint">{data.station.availability ? "หักช่วงที่มีสถานะ Offline/Unknown ตาม status event" : "ยังไม่มี status event ที่ใช้คำนวณได้"}</p></article>
            <article className="card"><p className="card-label">Calendar headroom</p><p className="kpi-value">{formatNumber(data.station.headroom, 1)}<small>%</small></p><p className="hint">ความสามารถที่ยังเหลือในเชิง capacity ไม่ใช่คิวว่างแบบ real-time</p></article>
            <article className="card"><p className="card-label">Availability evidence</p><p className="kpi-value">{data.station.availability ? <>{formatNumber(data.station.availability.uptime ?? 0, 1)}<small>% uptime</small></> : "—"}</p><p className="hint">{data.station.availability ? `ครอบคลุมสถานะ ${formatNumber(data.station.availability.coverage, 1)}% ของช่วงที่เลือก` : `${formatNumber(data.station.connectorCount)} หัว · ${formatNumber(data.station.sessions)} sessions`}</p></article>
          </section>

          <section className="content-grid utilization-overview-grid">
            <article className="panel utilization-station-panel">
              <div className="utilization-section-heading"><div><p className="section-label">STATION OVERVIEW</p><h2>ภาพรวม Meta Mall</h2></div><span className={`utilization-load-badge ${gaugeClass(data.station.utilization)}`}>{data.station.utilization >= 80 ? "ใกล้เต็ม" : data.station.utilization >= 50 ? "ใช้งานปานกลาง" : "ยังมี headroom สูง"}</span></div>
              <div className="utilization-gauge"><div className="utilization-gauge-track"><i className={`utilization-gauge-fill ${gaugeClass(data.station.utilization)}`} style={{ width: `${data.station.utilization}%` }} /></div><div className="utilization-gauge-labels"><strong>{formatNumber(data.station.utilization, 1)}% used</strong><span>{formatNumber(data.station.headroom, 1)}% headroom</span></div></div>
              <div className="utilization-status-summary"><span><i className="status-dot online" />Online <strong>{formatNumber(data.station.statusCounts.online)}</strong></span><span><i className="status-dot offline" />Offline <strong>{formatNumber(data.station.statusCounts.offline)}</strong></span><span><i className="status-dot unknown" />ไม่ระบุ <strong>{formatNumber(data.station.statusCounts.unknown)}</strong></span></div>
              <p className="chart-footnote">กราฟนี้คือ Calendar utilization จากเวลาที่เลือกทั้งหมด · {data.station.availability ? `Available-time utilization ${formatNumber(data.station.availability.utilization, 1)}% จากสถานะที่สังเกตได้` : "ยังไม่มี status event จึงยังหัก uptime/downtime ไม่ได้"}</p>
            </article>

            <article className="panel">
              <div className="utilization-section-heading"><div><p className="section-label">DAILY UTILIZATION TREND</p><h2>แนวโน้มการใช้ capacity รายวัน</h2></div><span className="hint">ใช้ดูวันที่มี demand สูง</span></div>
              <div className="utilization-trend-chart" role="img" aria-label="กราฟ utilization รายวัน">
                {(data.trend ?? []).map((row) => <div className="utilization-trend-column" key={row.date} title={`${formatShortDate(row.date)} · utilization ${formatNumber(row.utilization, 1)}% · ${formatNumber(row.sessions)} sessions`}><div className="utilization-trend-value">{formatNumber(row.utilization, 0)}%</div><div className={`utilization-trend-bar ${gaugeClass(row.utilization)}`} style={{ height: `${Math.max(3, (row.utilization / trendMax) * 100)}%` }} /><span>{formatShortDate(row.date)}</span></div>)}
              </div>
              <p className="chart-footnote">คำนวณตามวันเริ่มต้นของ session · ใช้เพื่อเห็นแนวโน้ม ไม่ใช่การวัด concurrent load รายชั่วโมง</p>
            </article>
          </section>

          <section className="panel utilization-table-panel">
            <div className="utilization-section-heading"><div><p className="section-label">BY CHARGER</p><h2>Utilization รายตู้ชาร์จ</h2></div><span className="hint">ใช้ชี้ว่าตู้ใดเป็นคอขวดหรือยังมี capacity ว่าง</span></div>
            <div className="utilization-asset-grid">{(data.chargers ?? []).map((row) => <article className="utilization-asset-card" key={row.id}><div className="utilization-asset-heading"><div><strong>{row.name}</strong><span>{formatNumber(row.connectorCount ?? 0)} หัว · {row.powerKw ? `${formatNumber(row.powerKw, 1)} kW` : "ไม่ระบุ power"}</span></div><span className={statusClass(row.statusGroup)}>{statusLabel(row.statusGroup)}</span></div><div className="utilization-asset-metric"><strong>{formatNumber(row.utilization, 1)}%</strong><span>utilization</span><strong>{formatNumber(row.headroom, 1)}%</strong><span>headroom</span></div><div className="utilization-meter"><i className={`utilization-gauge-fill ${gaugeClass(row.utilization)}`} style={{ width: `${row.utilization}%` }} /></div><div className="utilization-asset-foot"><span>{formatNumber(row.sessions)} sessions · {formatNumber(row.energyKwh, 1)} kWh</span><span>{formatNumber(row.headroomHours, 1)} ชม.ว่าง</span></div>{row.overlapDetected && <small className="utilization-warning">พบเวลาการใช้งานซ้อนกัน อาจต้องตรวจสอบข้อมูล session</small>}</article>)}</div>
            </section>

          <section className="panel utilization-table-panel">
            <div className="utilization-section-heading"><div><p className="section-label">BY CONNECTOR</p><h2>Utilization รายหัวชาร์จ</h2></div><span className="hint">ใช้หา headroom ที่แท้จริงและหัวที่มี demand สูง</span></div>
            <div className="retention-table-wrap">
              <table className="retention-table utilization-table"><thead><tr><th>ตู้</th><th>หัวชาร์จ</th><th>สถานะ</th><th>Sessions</th><th>พลังงาน</th><th>Occupied</th><th>Calendar util.</th><th>Available-time util.</th><th>Headroom</th></tr></thead><tbody>{(data.connectors ?? []).map((row) => <tr key={row.id}><td><strong>{row.chargerName}</strong></td><td>{row.connectorName}</td><td><span className={statusClass(row.statusGroup)}>{statusLabel(row.statusGroup)}</span></td><td>{formatNumber(row.sessions)}</td><td>{formatNumber(row.energyKwh, 1)} kWh</td><td>{formatNumber(row.occupiedHours, 1)} ชม.</td><td className={`utilization-cell ${gaugeClass(row.utilization)}`}>{formatNumber(row.utilization, 1)}%</td><td className={`utilization-cell ${row.availability ? gaugeClass(row.availability.utilization) : "unknown"}`}>{row.availability ? <>{formatNumber(row.availability.utilization, 1)}%<small>coverage {formatNumber(row.availability.coverage, 0)}%</small></> : "—"}</td><td>{formatNumber(row.headroom, 1)}%<small>{formatNumber(row.headroomHours, 1)} ชม.</small></td></tr>)}</tbody></table>
            </div>
          </section>

          <section className="panel utilization-method-panel"><p className="section-label">นิยามและข้อจำกัด</p><div className="utilization-method-grid"><div><strong>Calendar utilization</strong><span>{data.definition?.utilization}</span></div><div><strong>Available-time utilization</strong><span>เวลาที่ใช้งานจริง ÷ เวลาที่ status event ระบุว่า Online; ช่วงไม่มีข้อมูลสถานะจะไม่ถูกนับเป็น uptime</span></div><div><strong>ขอบเขตข้อมูล</strong><span>{data.definition?.limitation}</span></div></div><p className="chart-footnote">{data.definition?.capacity} · Headroom ในหน้านี้เป็น capacity ที่ว่างจากข้อมูล session ไม่ใช่จำนวนหัวที่ว่าง ณ ขณะนั้น</p></section>
        </>
      )}

      {!loading && !error && !data?.station && <section className="panel empty-state"><p className="section-label">ยังไม่มีข้อมูล</p><h2>ยังไม่มีข้อมูล utilization</h2><p className="hint">ตรวจสอบว่ามีข้อมูล Order List และ master ของตู้/หัวชาร์จในระบบแล้ว</p><Link className="action-link" href="/imports">ไปนำเข้าข้อมูล</Link></section>}
    </main>
  );
}

"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RecordFilter from "../components/RecordFilter";
import { inputDate, rangeLabel } from "../../lib/display-date";

type Alarm = {
  id: string;
  code: string;
  reason: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number;
  status: string;
  chargerName: string;
  connectorName: string;
  impactedSessionCount: number;
  impactedShortSessionCount: number;
  nextSessionAt: string | null;
  nextSessionEndAt: string | null;
  nextSessionDurationSeconds: number | null;
  nextSessionKwh: number | null;
  nextSessionStopReason: string | null;
};

type AlarmData = {
  range?: { from: string; to: string };
  message?: string;
  summary?: { total: number; incidents: number; recovered: number; active: number; openIncidents: number; longerThan5Minutes: number; overlappingSessions: number; impactedSessions: number; incidentDurationMinutes: number };
  topCauses?: Array<{ code: string; reason: string; incidentCount: number; alarmRecordCount: number; durationSeconds: number; impactedSessions: number; deviceCount: number; activeIncidents: number }>;
  incidents?: Array<{ id: string; code: string; reason: string; chargerName: string; connectorName: string; startAt: string; endAt: string | null; status: string; alarmCount: number; durationSeconds: number; impactedSessionCount: number; impactedShortSessionCount: number }>;
  items?: Alarm[];
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "ยังไม่สิ้นสุด";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${formatNumber(seconds)} วินาที`;
  return `${formatNumber(seconds / 60, 1)} นาที`;
}

function AlarmsContent() {
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get("from") ?? "";
  const initialTo = searchParams.get("to") ?? "";
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<AlarmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const visibleItems = (data?.items ?? []).filter(item => {
    const recovered = item.status.toLowerCase() === "recovered" && !!item.endAt;
    return (status === "all" || (status === "open" ? !recovered : recovered)) &&
      [item.code, item.reason, item.chargerName, item.connectorName].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });

  const loadData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (start) query.set("from", start);
    if (end) query.set("to", end);
    try {
      const response = await fetch(`/api/dashboard/alarms?${query.toString()}`, { cache: "no-store" });
      const result = (await response.json()) as AlarmData;
      if (!response.ok) throw new Error(result.message ?? "alarms unavailable");
      setData(result);
      if (result.range) { setFrom(inputDate(result.range.from)); setTo(inputDate(result.range.to)); }
    } catch (loadError) {
      console.error("Unable to load alarms", loadError);
      setError("ขณะนี้ยังไม่สามารถอ่านรายการ Alarm ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(initialFrom, initialTo); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialFrom, initialTo, loadData]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadData(from, to);
  }

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <p className="eyebrow">TCE CHARGEX · ALARM LOG</p>
        <h1>รายการ Alarm ของสถานี</h1>
        <p className="lede">ตรวจสอบวันเวลา สาเหตุ และผลที่เกิดกับ session ในช่วงเดียวกัน เพื่อแยกสัญญาณทางเทคนิคออกจากผลกระทบต่อผู้ใช้</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={onSubmit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตรายการ</button>
        </form>
        <p className="hint drilldown-note">หนึ่ง Alarm คือหนึ่ง record จากระบบ ไม่ควรนำเวลาของหลาย Alarm ที่ซ้อนกันมาบวกรวมเป็น downtime ของสถานีโดยตรง</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังโหลดบันทึก Alarm…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void loadData(from, to)}>ลองใหม่</button></section>}

      {data?.summary && !loading && !error && (
        <>
          <p className="loaded-period">{rangeLabel(data.range)}</p>
          <section className="grid alarm-summary-grid">
            <article className="card"><p className="card-label">Alarm records</p><p className="kpi-value">{formatNumber(data.summary.total)}</p><p className="hint">รายการจากระบบ</p></article>
            <article className="card"><p className="card-label">Technical incidents</p><p className="kpi-value">{formatNumber(data.summary.incidents)}</p><p className="hint">รวม Alarm ต่อเนื่องเป็นเหตุการณ์เดียว</p></article>
            <article className="card"><p className="card-label">Session ที่ได้รับผลกระทบ</p><p className="kpi-value">{formatNumber(data.summary.impactedSessions)}</p><p className="hint">นับ session แบบไม่ซ้ำกัน</p></article>
            <article className="card"><p className="card-label">Open incidents</p><p className="kpi-value">{formatNumber(data.summary.openIncidents)}</p><p className="hint">Alarm records ที่ยังไม่ Recovered {formatNumber(data.summary.active)} รายการ</p></article>
          </section>

          <section className="panel incident-summary-panel">
            <div className="decision-heading">
              <div><p className="section-label">INCIDENT VIEW</p><h2>เหตุการณ์ทางเทคนิคหลังรวม Alarm ซ้ำ</h2></div>
              <span className="period-label">เวลารวมของกลุ่ม Alarm {formatNumber(data.summary.incidentDurationMinutes, 1)} นาที</span>
            </div>
            <p className="hint incident-definition">รวมรหัสและสาเหตุเดียวกันบนหัวเดียวกันที่ห่างไม่เกิน 5 นาทีเป็นกลุ่มเดียว · เวลารวมนี้ยังไม่ใช่ Downtime ของสถานี</p>
            <div className="incident-table-wrap">
              <table className="incident-table">
                <thead><tr><th>เริ่มเกิด</th><th>สาเหตุ</th><th>ตู้ / หัว</th><th>Alarm records</th><th>เวลารวมไม่ซ้อน</th><th>Session กระทบ</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {(data.incidents ?? []).map((incident) => <tr key={incident.id}><td>{formatDateTime(incident.startAt)}</td><td><strong>Code {incident.code}</strong><small>{incident.reason}</small></td><td>{incident.chargerName}<small>Connector {incident.connectorName}</small></td><td>{formatNumber(incident.alarmCount)}</td><td>{formatDuration(incident.durationSeconds)}</td><td>{formatNumber(incident.impactedSessionCount)}{incident.impactedShortSessionCount > 0 ? ` · สั้น ${formatNumber(incident.impactedShortSessionCount)}` : ""}</td><td><span className={`alarm-status ${incident.status === "Recovered" ? "recovered" : "active"}`}>{incident.status}</span></td></tr>)}
                </tbody>
              </table>
              {!data.incidents?.length && <p className="hint">ไม่พบ Technical incident ในช่วงวันที่เลือก</p>}
            </div>
          </section>

          <section className="panel incident-summary-panel">
            <div className="decision-heading">
              <div><p className="section-label">TOP 5 CAUSES</p><h2>สาเหตุที่เกิดบ่อยที่สุด</h2></div>
              <span className="period-label">ใช้จัดลำดับจุดที่ควรตรวจสอบ</span>
            </div>
            <div className="incident-table-wrap">
              <table className="incident-table cause-table">
                <thead><tr><th>Code / สาเหตุ</th><th>Incidents</th><th>Alarm records</th><th>ตู้ / หัวที่พบ</th><th>Session กระทบ</th><th>เวลารวม</th><th>Open</th></tr></thead>
                <tbody>
                  {(data.topCauses ?? []).map((cause) => <tr key={`${cause.code}-${cause.reason}`}><td><strong>Code {cause.code}</strong><small>{cause.reason}</small></td><td>{formatNumber(cause.incidentCount)}</td><td>{formatNumber(cause.alarmRecordCount)}</td><td>{formatNumber(cause.deviceCount)}</td><td>{formatNumber(cause.impactedSessions)}</td><td>{formatDuration(cause.durationSeconds)}</td><td>{formatNumber(cause.activeIncidents)}</td></tr>)}
                </tbody>
              </table>
              {!data.topCauses?.length && <p className="hint">ยังไม่มีข้อมูลสาเหตุในช่วงวันที่เลือก</p>}
            </div>
          </section>

          <section className="panel abnormal-panel">
            <div className="decision-heading">
              <div><p className="section-label">ALARM DRILL-DOWN</p><h2>วันเวลาและรายละเอียดแต่ละเหตุการณ์</h2></div>
              <span className="period-label">Alarm records ที่ทับช่วง session {formatNumber(data.summary.overlappingSessions)} รายการ</span>
            </div>
            <div className="abnormal-list">
              <RecordFilter query={query} onQuery={setQuery} status={status} onStatus={setStatus} shown={visibleItems.length} total={data.items?.length ?? 0} options={[{ value: "all", label: "ทุกสถานะ" }, { value: "open", label: "ยังไม่ปิด" }, { value: "recovered", label: "Recovered แล้ว" }]} />
              {!visibleItems.length && <p className="record-empty">ไม่พบรายการที่ตรงกับตัวกรอง ลองเปลี่ยนคำค้น สถานะ หรือช่วงวันที่</p>}
              {visibleItems.map((alarm) => (
                <details className="abnormal-item alarm-item" key={alarm.id}>
                  <summary>
                    <span className="abnormal-time">{formatDateTime(alarm.startAt)}</span>
                    <span className="abnormal-identity">Code {alarm.code}<small>{alarm.reason}</small></span>
                    <span className="abnormal-usage">{alarm.chargerName}<small>Connector {alarm.connectorName}</small></span>
                    <span className={`alarm-status ${alarm.status.toLowerCase() === "recovered" ? "recovered" : "active"}`}>{alarm.status}</span>
                  </summary>
                  <div className="abnormal-details">
                    <div className="alarm-detail-grid">
                      <div><span>เริ่มเกิด</span><strong>{formatDateTime(alarm.startAt)}</strong></div>
                      <div><span>สิ้นสุด</span><strong>{formatDateTime(alarm.endAt)}</strong></div>
                      <div><span>ระยะเวลา</span><strong>{alarm.endAt ? formatDuration(alarm.durationSeconds) : "กำลังดำเนินอยู่"}</strong></div>
                      <div><span>session ทับช่วง</span><strong>{formatNumber(alarm.impactedSessionCount)} รายการ{alarm.impactedShortSessionCount > 0 ? ` · ชาร์จสั้น ${formatNumber(alarm.impactedShortSessionCount)}` : ""}</strong></div>
                    </div>
                    {alarm.nextSessionAt ? (
                      <div className="recovery-detail positive"><strong>Session ถัดไปบนหัวชาร์จเดียวกัน</strong><span>{formatDateTime(alarm.nextSessionAt)} ถึง {formatDateTime(alarm.nextSessionEndAt)} · {formatDuration(alarm.nextSessionDurationSeconds ?? 0)} · {formatNumber(alarm.nextSessionKwh ?? 0, 2)} kWh · {alarm.nextSessionStopReason ?? "ไม่ระบุสาเหตุหยุด"}</span></div>
                    ) : (
                      <div className="recovery-detail pending"><strong>ยังไม่พบ session ถัดไปบนหัวชาร์จเดียวกัน</strong><span>ตรวจจากข้อมูล session ที่นำเข้าปัจจุบัน</span></div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function AlarmsPage() {
  return <Suspense fallback={<main className="shell"><section className="panel loading-state"><p>กำลังเตรียมบันทึก Alarm…</p></section></main>}><AlarmsContent /></Suspense>;
}

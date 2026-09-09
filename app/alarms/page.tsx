"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  message?: string;
  summary?: { total: number; recovered: number; active: number; longerThan5Minutes: number; overlappingSessions: number };
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
          <button type="submit">อัปเดตรายการ</button>
        </form>
        <p className="hint drilldown-note">หนึ่ง Alarm คือหนึ่ง record จากระบบ ไม่ควรนำเวลาของหลาย Alarm ที่ซ้อนกันมาบวกรวมเป็น downtime ของสถานีโดยตรง</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังโหลดบันทึก Alarm…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void loadData(from, to)}>ลองใหม่</button></section>}

      {data?.summary && !loading && (
        <>
          <section className="grid alarm-summary-grid">
            <article className="card"><p className="card-label">Alarm ทั้งหมด</p><p className="kpi-value">{formatNumber(data.summary.total)}</p></article>
            <article className="card"><p className="card-label">Recovered</p><p className="kpi-value">{formatNumber(data.summary.recovered)}</p><p className="hint">สิ้นสุดในข้อมูลที่นำเข้า</p></article>
            <article className="card"><p className="card-label">ยังต้องตรวจสอบ</p><p className="kpi-value">{formatNumber(data.summary.active)}</p><p className="hint">สถานะไม่ใช่ Recovered หรือยังไม่มีเวลาสิ้นสุด</p></article>
            <article className="card"><p className="card-label">นานตั้งแต่ 5 นาที</p><p className="kpi-value">{formatNumber(data.summary.longerThan5Minutes)}</p><p className="hint">จัดเป็นรายการติดตามก่อน</p></article>
          </section>

          <section className="panel abnormal-panel">
            <div className="decision-heading">
              <div><p className="section-label">ALARM DRILL-DOWN</p><h2>วันเวลาและรายละเอียดแต่ละเหตุการณ์</h2></div>
              <span className="period-label">พบ session ทับช่วง Alarm {formatNumber(data.summary.overlappingSessions)} รายการ</span>
            </div>
            <div className="abnormal-list">
              {(data.items ?? []).map((alarm) => (
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
              {!data.items?.length && <p className="hint">ไม่พบ Alarm ในช่วงวันที่เลือก</p>}
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

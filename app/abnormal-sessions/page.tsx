"use client";

import { Suspense, FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RecordFilter from "../components/RecordFilter";
import { inputDate, rangeLabel } from "../../lib/display-date";

type RecoveryStatus = "recovered_5m" | "recovered_30m" | "recovered_same_day" | "recovered_later" | "no_recovery_observed";

type AbnormalSession = {
  id: string;
  startAt: string;
  endAt: string | null;
  customerMask: string;
  chargerName: string;
  connectorName: string;
  durationSeconds: number;
  energyKwh: number;
  stopReason: string | null;
  reasonCategory: string | null;
  recoveryStatus: RecoveryStatus;
  recoveryAt: string | null;
  recoveryEndAt: string | null;
  recoveryGapMinutes: number | null;
  recoveryDurationSeconds: number | null;
  recoveryKwh: number | null;
  recoveryStopReason: string | null;
  recoveryReasonCategory: string | null;
  recoveryChargerName: string | null;
  recoveryConnectorName: string | null;
  recoveryPath: "same_connector" | "same_charger_other_connector" | "other_charger" | "no_recovery";
  retryLevel: "none" | "once" | "multiple";
  successfulSessions7d: number;
  successfulSessions30d: number;
  returnedWithin7d: boolean;
  returnedWithin30d: boolean;
  retryCount: number;
  alarmCount: number;
  alarmSummary: string | null;
};

type AbnormalData = {
  range?: { from: string; to: string };
  message?: string;
  summary?: {
    total: number;
    recovered5m: number;
    recovered30m: number;
    recoveredSameDay: number;
    noRecoveryObserved: number;
    withOverlappingAlarm: number;
    sameConnectorRecovery: number;
    sameChargerOtherConnector: number;
    otherChargerRecovery: number;
    multipleRetry: number;
    returnedWithin7d: number;
    returnedWithin30d: number;
  };
  priorityCases?: Array<{
    chargerName: string;
    connectorName: string;
    shortSessions: number;
    noRecovery: number;
    multipleRetry: number;
    alarmLinked: number;
    recovered: number;
    recoveryRate: number;
    riskScore: number;
    priority: "high" | "watch" | "monitor";
  }>;
  items?: AbnormalSession[];
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "–";
  if (seconds < 60) return `${formatNumber(seconds)} วินาที`;
  return `${formatNumber(seconds / 60, 1)} นาที`;
}

const recoveryLabels: Record<RecoveryStatus, string> = {
  recovered_5m: "กลับมาสำเร็จภายใน 5 นาที",
  recovered_30m: "กลับมาสำเร็จภายใน 30 นาที",
  recovered_same_day: "กลับมาสำเร็จภายในวัน",
  recovered_later: "กลับมาสำเร็จในวันถัดไป",
  no_recovery_observed: "ยังไม่พบการกลับมาสำเร็จ",
};

const recoveryPathLabels: Record<AbnormalSession["recoveryPath"], string> = {
  same_connector: "หัวเดิม",
  same_charger_other_connector: "ตู้เดิม เปลี่ยนหัว",
  other_charger: "เปลี่ยนตู้",
  no_recovery: "ยังไม่พบ recovery",
};

const priorityLabels = {
  high: "เร่งตรวจสอบ",
  watch: "เฝ้าระวัง",
  monitor: "ติดตาม",
};

function AbnormalSessionsContent() {
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get("from") ?? "";
  const initialTo = searchParams.get("to") ?? "";
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<AbnormalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const visibleItems = (data?.items ?? []).filter(item =>
    (status === "all" || (status === "pending" ? !item.recoveryAt : !!item.recoveryAt)) &&
    [item.customerMask, item.chargerName, item.connectorName, item.stopReason, item.alarmSummary].join(" ").toLowerCase().includes(query.trim().toLowerCase()));

  const loadData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (start) query.set("from", start);
    if (end) query.set("to", end);
    try {
      const response = await fetch(`/api/dashboard/abnormal-sessions?${query.toString()}`, { cache: "no-store" });
      const result = (await response.json()) as AbnormalData;
      if (!response.ok) throw new Error(result.message ?? "abnormal sessions unavailable");
      setData(result);
      if (result.range) { setFrom(inputDate(result.range.from)); setTo(inputDate(result.range.to)); }
    } catch (loadError) {
      console.error("Unable to load abnormal sessions", loadError);
      setError("ขณะนี้ยังไม่สามารถอ่านรายละเอียดความผิดปกติได้");
    } finally {
      setLoading(false);
    }
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadData(from, to);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(initialFrom, initialTo); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialFrom, initialTo, loadData]);

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <p className="eyebrow">TCE CHARGEX · EXPERIENCE REVIEW</p>
        <h1>ตรวจสอบการชาร์จสั้นผิดปกติ</h1>
        <p className="lede">เปิดดูแต่ละ session เพื่อแยกว่าเป็น retry ของลูกค้า เหตุการณ์ที่กลับมาชาร์จสำเร็จ หรือกรณีที่ควรติดตามกับสถานี</p>
      </section>

      <section className="panel filter-panel">
        <form className="filter-form" onSubmit={onSubmit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตรายการ</button>
        </form>
        <p className="hint drilldown-note">นิยาม “ชาร์จสั้นผิดปกติ” คือระยะเวลาน้อยกว่า 60 วินาที หรือพลังงานน้อยกว่า 1 kWh. “ยังไม่พบการกลับมาสำเร็จ” หมายถึงไม่พบ session ถัดไปที่เข้าเกณฑ์ในข้อมูลปัจจุบัน ไม่ได้แปลว่าสูญเสียลูกค้า</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังตรวจสอบ recovery และ retry…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void loadData(from, to)}>ลองใหม่</button></section>}

      {data?.summary && !loading && !error && (
        <>
          <p className="loaded-period">{rangeLabel(data.range)}</p>
          <section className="grid abnormal-summary-grid">
            <article className="card"><p className="card-label">ชาร์จสั้นผิดปกติ</p><p className="kpi-value">{formatNumber(data.summary.total)}</p><p className="hint">ในช่วงวันที่เลือก</p></article>
            <article className="card"><p className="card-label">กลับมาสำเร็จ ≤ 5 นาที</p><p className="kpi-value">{formatNumber(data.summary.recovered5m)}</p><p className="hint">สัญญาณ retry ระยะสั้น</p></article>
            <article className="card"><p className="card-label">กลับมาสำเร็จ ≤ 30 นาที</p><p className="kpi-value">{formatNumber(data.summary.recovered30m)}</p><p className="hint">รวม recovery เร็ว</p></article>
            <article className="card"><p className="card-label">ยังไม่พบ recovery</p><p className="kpi-value">{formatNumber(data.summary.noRecoveryObserved)}</p><p className="hint">ควรตรวจสอบร่วมกับบริบทอื่น</p></article>
          </section>

          <section className="panel recovery-summary-panel">
            <div className="decision-heading">
              <div><p className="section-label">CUSTOMER RECOVERY & RETENTION</p><h2>รูปแบบการกลับมาใช้บริการ</h2></div>
              <span className="period-label">นับจาก Customer ID แบบปกปิด</span>
            </div>
            <div className="recovery-summary-grid">
              <article className="decision-metric"><span>กลับมาที่หัวเดิม</span><strong>{formatNumber(data.summary.sameConnectorRecovery)}</strong><small>Recovery สำเร็จเร็ว/ภายในช่วงติดตาม</small></article>
              <article className="decision-metric"><span>ตู้เดิม เปลี่ยนหัว</span><strong>{formatNumber(data.summary.sameChargerOtherConnector)}</strong><small>ใช้ตู้เดิมแต่เปลี่ยน connector</small></article>
              <article className="decision-metric"><span>เปลี่ยนตู้</span><strong>{formatNumber(data.summary.otherChargerRecovery)}</strong><small>สัญญาณว่าหัวเดิม/ตู้เดิมอาจมีปัญหา</small></article>
              <article className="decision-metric"><span>กลับมาใช้ซ้ำใน 7 วัน</span><strong>{formatNumber(data.summary.returnedWithin7d)}</strong><small>ดู retention หลังเหตุผิดปกติ</small></article>
              <article className="decision-metric"><span>กลับมาใช้ซ้ำใน 30 วัน</span><strong>{formatNumber(data.summary.returnedWithin30d)}</strong><small>รวมการกลับมาในช่วงติดตาม</small></article>
              <article className="decision-metric"><span>Retry หลายครั้ง</span><strong>{formatNumber(data.summary.multipleRetry)}</strong><small>มี short session ซ้ำตั้งแต่ 2 ครั้งขึ้นไป</small></article>
            </div>
          </section>

          <section className="panel priority-panel">
            <div className="decision-heading">
              <div><p className="section-label">ACTION CENTER</p><h2>จุดที่ควรจัดลำดับแก้ไข</h2></div>
              <span className="period-label">เรียงตามความเสี่ยงจากข้อมูลช่วงที่เลือก</span>
            </div>
            <p className="hint priority-note">คะแนนความเสี่ยงใช้ประกอบการจัดลำดับงาน: ไม่พบ recovery, retry หลายครั้ง, มี Alarm ซ้อน และจำนวนชาร์จสั้น ไม่ใช่การยืนยันสาเหตุของปัญหา</p>
            <div className="priority-table-wrap">
              <table className="priority-table">
                <thead><tr><th>ระดับ</th><th>Charger / หัว</th><th>ชาร์จสั้น</th><th>ไม่พบ recovery</th><th>Retry หลายครั้ง</th><th>Alarm ซ้อน</th><th>Recovery rate</th><th>ข้อเสนอแนะ</th></tr></thead>
                <tbody>
                  {(data.priorityCases ?? []).map((item) => (
                    <tr key={`${item.chargerName}-${item.connectorName}`}>
                      <td><span className={`priority-badge ${item.priority}`}>{priorityLabels[item.priority]}</span><small>Score {formatNumber(item.riskScore)}</small></td>
                      <td><strong>{item.chargerName}</strong><small>Connector {item.connectorName}</small></td>
                      <td>{formatNumber(item.shortSessions)}</td>
                      <td>{formatNumber(item.noRecovery)}</td>
                      <td>{formatNumber(item.multipleRetry)}</td>
                      <td>{formatNumber(item.alarmLinked)}</td>
                      <td>{formatNumber(item.recoveryRate, 1)}%</td>
                      <td>{item.noRecovery > 0 ? "ตรวจหัว/สถานะก่อน" : item.multipleRetry > 0 ? "ตรวจ flow retry" : "ติดตามแนวโน้ม"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.priorityCases?.length && <p className="hint">ยังไม่มีจุดที่ต้องจัดลำดับแก้ไข</p>}
            </div>
          </section>

          <section className="panel abnormal-panel">
            <div className="decision-heading">
              <div><p className="section-label">DRILL-DOWN</p><h2>รายการที่ตรวจสอบได้ทีละเหตุการณ์</h2></div>
              <span className="period-label">พบ Alarm ซ้อนช่วง {formatNumber(data.summary.withOverlappingAlarm)} เหตุการณ์</span>
            </div>
            <div className="abnormal-list">
              <RecordFilter query={query} onQuery={setQuery} status={status} onStatus={setStatus} shown={visibleItems.length} total={data.items?.length ?? 0} options={[{ value: "all", label: "ทุกสถานะ" }, { value: "pending", label: "ยังไม่พบกลับมาสำเร็จ" }, { value: "recovered", label: "กลับมาสำเร็จแล้ว" }]} />
              {visibleItems.map((item) => (
                <details className="abnormal-item" key={item.id}>
                  <summary>
                    <span className="abnormal-time">{formatDateTime(item.startAt)}</span>
                    <span className="abnormal-identity">{item.customerMask}<small>{item.chargerName} · {item.connectorName}</small></span>
                    <span className="abnormal-usage">{formatDuration(item.durationSeconds)}<small>{formatNumber(item.energyKwh, 2)} kWh</small></span>
                    <span className={`recovery-badge ${item.recoveryStatus}`}>{recoveryLabels[item.recoveryStatus]}</span>
                  </summary>
                  <div className="abnormal-details">
                    {item.recoveryAt ? (
                      <div className="session-comparison">
                        <article className="session-record short-record">
                          <p className="record-label">1 · Session ชาร์จสั้นผิดปกติ</p>
                          <dl>
                            <div><dt>Charger / หัวชาร์จ</dt><dd>{item.chargerName} · {item.connectorName}</dd></div>
                            <div><dt>เริ่ม / สิ้นสุด</dt><dd>{formatDateTime(item.startAt)}<br />{formatDateTime(item.endAt)}</dd></div>
                            <div><dt>ระยะเวลา / พลังงาน</dt><dd>{formatDuration(item.durationSeconds)}<br />{formatNumber(item.energyKwh, 2)} kWh</dd></div>
                            <div><dt>สาเหตุที่บันทึก</dt><dd>{item.stopReason ?? item.reasonCategory ?? "ไม่ระบุ"}</dd></div>
                          </dl>
                        </article>
                        <div className="recovery-arrow">
                          <strong>Recovery</strong>
                          <span>เว้น {formatNumber(item.recoveryGapMinutes ?? 0, 1)} นาที</span>
                          {item.retryCount > 0 && <span>retry สั้น {formatNumber(item.retryCount)} ครั้ง</span>}
                        </div>
                        <article className="session-record recovered-record">
                          <p className="record-label">2 · Session กลับมาชาร์จสำเร็จ</p>
                          <dl>
                            <div><dt>Charger / หัวชาร์จ</dt><dd>{item.recoveryChargerName ?? "ไม่ระบุ"} · {item.recoveryConnectorName ?? "ไม่ระบุ"}</dd></div>
                            <div><dt>เริ่ม / สิ้นสุด</dt><dd>{formatDateTime(item.recoveryAt)}<br />{formatDateTime(item.recoveryEndAt)}</dd></div>
                            <div><dt>ระยะเวลา / พลังงาน</dt><dd>{formatDuration(item.recoveryDurationSeconds)}<br />{formatNumber(item.recoveryKwh ?? 0, 2)} kWh</dd></div>
                            <div><dt>สาเหตุที่บันทึก</dt><dd>{item.recoveryStopReason ?? item.recoveryReasonCategory ?? "ไม่ระบุ"}</dd></div>
                          </dl>
                          <div className="recovery-detail positive"><strong>{recoveryPathLabels[item.recoveryPath]}</strong><span>กลับมาใช้ซ้ำใน 7 วัน: {item.returnedWithin7d ? "ใช่" : "ไม่พบในข้อมูล"} · 30 วัน: {item.returnedWithin30d ? "ใช่" : "ไม่พบในข้อมูล"}</span></div>
                        </article>
                      </div>
                    ) : (
                      <>
                        <article className="session-record short-record">
                          <p className="record-label">Session ชาร์จสั้นผิดปกติ</p>
                          <dl>
                            <div><dt>Charger / หัวชาร์จ</dt><dd>{item.chargerName} · {item.connectorName}</dd></div>
                            <div><dt>เริ่ม / สิ้นสุด</dt><dd>{formatDateTime(item.startAt)}<br />{formatDateTime(item.endAt)}</dd></div>
                            <div><dt>ระยะเวลา / พลังงาน</dt><dd>{formatDuration(item.durationSeconds)}<br />{formatNumber(item.energyKwh, 2)} kWh</dd></div>
                            <div><dt>สาเหตุที่บันทึก</dt><dd>{item.stopReason ?? item.reasonCategory ?? "ไม่ระบุ"}</dd></div>
                          </dl>
                        </article>
                        <div className="recovery-detail pending"><strong>ยังไม่พบการกลับมาชาร์จที่เข้าเกณฑ์</strong><span>ตรวจจากข้อมูล Meta Mall หลัง session นี้จนถึงข้อมูลล่าสุดที่นำเข้า · retry สั้น {formatNumber(item.retryCount)} ครั้ง</span></div>
                      </>
                    )}
                    {item.alarmCount > 0 && <div className="alarm-detail"><strong>Alarm ซ้อนช่วงเวลา {formatNumber(item.alarmCount)} รายการ</strong><span>{item.alarmSummary}</span></div>}
                  </div>
                </details>
              ))}
              {!visibleItems.length && <p className="record-empty">ไม่พบรายการที่ตรงกับตัวกรอง ลองเปลี่ยนคำค้น สถานะ หรือช่วงวันที่</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function AbnormalSessionsPage() {
  return (
    <Suspense fallback={<main className="shell"><section className="panel loading-state"><p>กำลังเตรียมหน้าตรวจสอบ…</p></section></main>}>
      <AbnormalSessionsContent />
    </Suspense>
  );
}

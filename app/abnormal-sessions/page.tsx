"use client";

import { Suspense, FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  recoveryGapMinutes: number | null;
  recoveryDurationSeconds: number | null;
  recoveryKwh: number | null;
  retryCount: number;
  alarmCount: number;
  alarmSummary: string | null;
};

type AbnormalData = {
  message?: string;
  summary?: {
    total: number;
    recovered5m: number;
    recovered30m: number;
    recoveredSameDay: number;
    noRecoveryObserved: number;
    withOverlappingAlarm: number;
  };
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

function AbnormalSessionsContent() {
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get("from") ?? "";
  const initialTo = searchParams.get("to") ?? "";
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<AbnormalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          <button type="submit">อัปเดตรายการ</button>
        </form>
        <p className="hint drilldown-note">นิยาม “ชาร์จสั้นผิดปกติ” คือระยะเวลาน้อยกว่า 60 วินาที หรือพลังงานน้อยกว่า 1 kWh. “ยังไม่พบการกลับมาสำเร็จ” หมายถึงไม่พบ session ถัดไปที่เข้าเกณฑ์ในข้อมูลปัจจุบัน ไม่ได้แปลว่าสูญเสียลูกค้า</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังตรวจสอบ recovery และ retry…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void loadData(from, to)}>ลองใหม่</button></section>}

      {data?.summary && !loading && (
        <>
          <section className="grid abnormal-summary-grid">
            <article className="card"><p className="card-label">ชาร์จสั้นผิดปกติ</p><p className="kpi-value">{formatNumber(data.summary.total)}</p><p className="hint">ในช่วงวันที่เลือก</p></article>
            <article className="card"><p className="card-label">กลับมาสำเร็จ ≤ 5 นาที</p><p className="kpi-value">{formatNumber(data.summary.recovered5m)}</p><p className="hint">สัญญาณ retry ระยะสั้น</p></article>
            <article className="card"><p className="card-label">กลับมาสำเร็จ ≤ 30 นาที</p><p className="kpi-value">{formatNumber(data.summary.recovered30m)}</p><p className="hint">รวม recovery เร็ว</p></article>
            <article className="card"><p className="card-label">ยังไม่พบ recovery</p><p className="kpi-value">{formatNumber(data.summary.noRecoveryObserved)}</p><p className="hint">ควรตรวจสอบร่วมกับบริบทอื่น</p></article>
          </section>

          <section className="panel abnormal-panel">
            <div className="decision-heading">
              <div><p className="section-label">DRILL-DOWN</p><h2>รายการที่ตรวจสอบได้ทีละเหตุการณ์</h2></div>
              <span className="period-label">พบ Alarm ซ้อนช่วง {formatNumber(data.summary.withOverlappingAlarm)} เหตุการณ์</span>
            </div>
            <div className="abnormal-list">
              {(data.items ?? []).map((item) => (
                <details className="abnormal-item" key={item.id}>
                  <summary>
                    <span className="abnormal-time">{formatDateTime(item.startAt)}</span>
                    <span className="abnormal-identity">{item.customerMask}<small>{item.chargerName} · {item.connectorName}</small></span>
                    <span className="abnormal-usage">{formatDuration(item.durationSeconds)}<small>{formatNumber(item.energyKwh, 2)} kWh</small></span>
                    <span className={`recovery-badge ${item.recoveryStatus}`}>{recoveryLabels[item.recoveryStatus]}</span>
                  </summary>
                  <div className="abnormal-details">
                    <dl>
                      <div><dt>เริ่มชาร์จ</dt><dd>{formatDateTime(item.startAt)}</dd></div>
                      <div><dt>หยุดชาร์จ</dt><dd>{formatDateTime(item.endAt)}</dd></div>
                      <div><dt>สาเหตุที่บันทึก</dt><dd>{item.stopReason ?? item.reasonCategory ?? "ไม่ระบุ"}</dd></div>
                      <div><dt>retry สั้นก่อนสำเร็จ</dt><dd>{formatNumber(item.retryCount)} ครั้ง</dd></div>
                    </dl>
                    {item.recoveryAt ? (
                      <div className="recovery-detail positive"><strong>{recoveryLabels[item.recoveryStatus]}</strong><span>เริ่มใหม่ {formatDateTime(item.recoveryAt)} · เว้น {formatNumber(item.recoveryGapMinutes ?? 0, 1)} นาที · {formatDuration(item.recoveryDurationSeconds)} · {formatNumber(item.recoveryKwh ?? 0, 2)} kWh</span></div>
                    ) : (
                      <div className="recovery-detail pending"><strong>ยังไม่พบการกลับมาชาร์จที่เข้าเกณฑ์</strong><span>ตรวจจากข้อมูล Meta Mall หลัง session นี้จนถึงข้อมูลล่าสุดที่นำเข้า</span></div>
                    )}
                    {item.alarmCount > 0 && <div className="alarm-detail"><strong>Alarm ซ้อนช่วงเวลา {formatNumber(item.alarmCount)} รายการ</strong><span>{item.alarmSummary}</span></div>}
                  </div>
                </details>
              ))}
              {!data.items?.length && <p className="hint">ไม่พบการชาร์จสั้นผิดปกติในช่วงวันที่เลือก</p>}
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

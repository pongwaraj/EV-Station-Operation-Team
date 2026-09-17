"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";

type MonthlyRetention = {
  month: string;
  sessions: number;
  meaningfulSessions: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  regularCustomers: number;
  regularRate: number;
};

type RetentionData = {
  message?: string;
  range?: { from: string; to: string };
  methodology?: { repeat: string; regular: string; lapse: string; meaningfulSession: string; customerKey: string };
  kpis?: {
    sessions: number;
    meaningfulSessions: number;
    unknownSessions: number;
    uniqueCustomers: number;
    averageRepeatCustomers: number;
    averageRepeatRate: number;
    averageRegularCustomers: number;
    activeRegularCustomers: number;
    atRiskRegularCustomers: number;
    lapsedRegularCustomers: number;
    regularLapseRate: number;
    medianExpectedGapDays: number;
    averageSessionsPer30Days: number;
    maxRegularCustomers: number;
  };
  cadenceBuckets?: Array<{ label: string; count: number }>;
  monthly?: MonthlyRetention[];
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}-01T00:00:00+07:00`));
}

export default function RetentionPage() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRetention = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/retention?from=${start}&to=${end}`, { cache: "no-store" });
      const result = await response.json() as RetentionData;
      if (!response.ok) throw new Error(result.message ?? "retention unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load retention analysis", loadError);
      setError("ยังไม่สามารถแสดงข้อมูลลูกค้าประจำได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRetention(DEFAULT_FROM, DEFAULT_TO); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRetention]);

  const chartMax = useMemo(() => Math.max(data?.kpis?.maxRegularCustomers ?? 0, data?.kpis?.averageRegularCustomers ?? 0, 1), [data]);
  const averageLinePosition = ((data?.kpis?.averageRegularCustomers ?? 0) / chartMax) * 100;
  const cadenceMax = useMemo(() => Math.max(...(data?.cadenceBuckets ?? []).map((bucket) => bucket.count), 1), [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadRetention(from, to);
  }

  return (
    <main className="shell retention-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">CUSTOMER RETENTION</p>
        <h1>ลูกค้าประจำและการกลับมาใช้ซ้ำ</h1>
        <p className="lede">แยกผู้มาใช้บริการครั้งเดียวออกจากลูกค้าประจำ เพื่อดูรอบการกลับมาชาร์จและสัญญาณที่ควรติดตามได้ตรงกับพฤติกรรมจริงของ Meta Mall</p>
      </section>

      <section className="panel retention-filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} min={DEFAULT_FROM} max={DEFAULT_TO} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} min={DEFAULT_FROM} max={DEFAULT_TO} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตการวิเคราะห์</button>
        </form>
        <div className="retention-range-note">ช่วงข้อมูลเริ่มต้น: 31 ก.ค. 2569 – 16 ก.ย. 2569 · ใช้ V ID/Customer ID ของ PEA Volta เป็น customer key · ตัด retry/ชาร์จสั้นออกจากการวัดลูกค้าประจำ</div>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังวิเคราะห์พฤติกรรมการกลับมาใช้ซ้ำ…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><p className="hint">หากหน้าอื่นก็แสดงสถานะรอเชื่อมต่อข้อมูล ให้ตั้งค่า DATABASE_URL ในระบบ production</p><button type="button" onClick={() => void loadRetention(from, to)}>ลองใหม่</button></section>}

      {data?.kpis && !loading && !error && (
        <>
          <div className="retention-period-line">
            <span>ข้อมูลที่แสดง: {data.range ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : "-"}</span>
            <span>สถานะลูกค้าประจำอ้างอิงจากรอบการกลับมาชาร์จของแต่ละคน</span>
          </div>

          <section className="grid retention-kpi-grid">
            <article className="card"><p className="card-label">ลูกค้าประจำเฉลี่ย</p><p className="kpi-value">{formatNumber(data.kpis.averageRegularCustomers, 1)} <small>คน/เดือน</small></p><p className="hint">อย่างน้อย 3 meaningful sessions ใน 30 วัน</p></article>
            <article className="card"><p className="card-label">รอบกลับมาชาร์จปกติ</p><p className="kpi-value">{formatNumber(data.kpis.medianExpectedGapDays, 1)} <small>วัน</small></p><p className="hint">ค่ามัธยฐานของรอบลูกค้าประจำ</p></article>
            <article className="card"><p className="card-label">ลูกค้าประจำที่ยัง Active</p><p className="kpi-value">{formatNumber(data.kpis.activeRegularCustomers)} <small>คน</small></p><p className="hint">ยังอยู่ในรอบการกลับมาชาร์จของตนเอง</p></article>
            <article className="card"><p className="card-label">Regular lapse rate</p><p className="kpi-value">{formatNumber(data.kpis.regularLapseRate, 1)}<small>%</small></p><p className="hint">{formatNumber(data.kpis.lapsedRegularCustomers)} คนที่ห่างจากรอบปกติเกิน grace period</p></article>
          </section>

          <section className="content-grid retention-main-grid">
            <article className="panel">
              <div className="retention-panel-heading"><div><p className="section-label">MONTHLY REGULAR CUSTOMERS</p><h2>ลูกค้าประจำรายเดือน เทียบกับค่าเฉลี่ย</h2></div><span className="chart-legend"><i className="repeat-key" /> ลูกค้าประจำ <i className="average-key-retention" /> ค่าเฉลี่ย</span></div>
              <div className="retention-chart" role="img" aria-label="กราฟจำนวนลูกค้าประจำรายเดือน เทียบกับค่าเฉลี่ย">
                <div className="retention-scale"><span>{formatNumber(chartMax)}</span><span>0</span></div>
                <div className="retention-chart-body">
                  <div className="retention-average-line" style={{ bottom: `${averageLinePosition}%` }}><span>เฉลี่ย {formatNumber(data.kpis.averageRegularCustomers, 1)} คน</span></div>
                  <div className="retention-bars">
                    {(data.monthly ?? []).map((row) => <div className="retention-bar-group" key={row.month} title={`${formatMonth(row.month)} · ${formatNumber(row.regularCustomers)} คน · Regular rate ${formatNumber(row.regularRate, 1)}%`}><div className="retention-bar-value">{formatNumber(row.regularCustomers)}</div><div className="retention-bar" style={{ height: `${(row.regularCustomers / chartMax) * 100}%` }} /><span>{formatMonth(row.month)}</span></div>)}
                  </div>
                </div>
              </div>
              <p className="chart-footnote">นับเฉพาะ session ที่มีเวลาอย่างน้อย 5 นาทีและพลังงานอย่างน้อย 1 kWh · เดือน ก.ค. และ ก.ย. เป็นข้อมูลบางส่วน</p>
            </article>

            <article className="panel retention-executive-panel">
              <p className="section-label">EXECUTIVE READOUT</p>
              <h2>สถานะลูกค้าประจำ ณ วันที่เลือก</h2>
              <div className="retention-readout-list">
                <div><span>Active</span><strong>{formatNumber(data.kpis.activeRegularCustomers)} คน</strong><small>ยังอยู่ภายในรอบชาร์จปกติ</small></div>
                <div><span>At risk</span><strong>{formatNumber(data.kpis.atRiskRegularCustomers)} คน</strong><small>เลยรอบปกติแล้ว แต่ยังไม่เกิน grace period 7 วัน</small></div>
                <div><span>Lapsed regular</span><strong>{formatNumber(data.kpis.lapsedRegularCustomers)} คน · {formatNumber(data.kpis.regularLapseRate, 1)}%</strong><small>ควรตรวจสอบสาเหตุและทำแคมเปญ win-back เฉพาะกลุ่ม</small></div>
                <div><span>ความถี่การใช้งานของลูกค้าประจำ</span><strong>{formatNumber(data.kpis.averageSessionsPer30Days, 1)} session / 30 วัน · ทุก {formatNumber(data.kpis.medianExpectedGapDays, 1)} วัน</strong><small>อิง observed cadence ไม่ใช่การคาดเดาจากสเปครถ</small></div>
              </div>
            </article>
          </section>

          <section className="panel retention-cadence-panel">
            <div className="retention-panel-heading"><div><p className="section-label">CUSTOMER CADENCE</p><h2>ลูกค้าประจำกลับมาชาร์จถี่แค่ไหน</h2></div><span className="hint">ใช้กำหนดจังหวะ CRM และติดตามกลุ่มที่เริ่มห่าง</span></div>
            <div className="retention-cadence-grid">{(data.cadenceBuckets ?? []).map((bucket) => <div className="retention-cadence-item" key={bucket.label}><div><strong>{bucket.label}</strong><span>{formatNumber(bucket.count)} คน</span></div><div className="cadence-track"><i className="cadence-fill" style={{ width: `${(bucket.count / cadenceMax) * 100}%` }} /></div></div>)}</div>
            <p className="chart-footnote">ข้อมูลนี้สะท้อนรอบการใช้งานจริงของลูกค้าที่สถานี ไม่ใช่ความถี่ที่รถทุกคันจำเป็นต้องชาร์จ</p>
          </section>

          <section className="panel retention-table-panel">
            <div className="retention-panel-heading"><div><p className="section-label">MONTHLY DETAIL</p><h2>ตารางสรุปเพื่อเทียบแนวโน้ม</h2></div><span className="hint">ผู้ใช้ครั้งเดียวไม่ถูกตีความเป็น churn</span></div>
            <div className="retention-table-wrap">
              <table className="retention-table">
                <thead><tr><th>เดือน</th><th>ลูกค้าที่ใช้งาน</th><th>Meaningful sessions</th><th>กลับมาใช้ซ้ำ<br /><small>≥ 2 ครั้ง</small></th><th>Repeat rate</th><th>ลูกค้าประจำ<br /><small>≥ 3 ครั้ง / ≥ 2 สัปดาห์</small></th><th>Regular rate</th></tr></thead>
                <tbody>{(data.monthly ?? []).map((row) => <tr key={row.month}><td><strong>{formatMonth(row.month)}</strong></td><td>{formatNumber(row.uniqueCustomers)}</td><td>{formatNumber(row.meaningfulSessions)}</td><td className="retention-positive">{formatNumber(row.repeatCustomers)}</td><td>{formatNumber(row.repeatRate, 1)}%</td><td className="retention-positive">{formatNumber(row.regularCustomers)}</td><td>{formatNumber(row.regularRate, 1)}%</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="panel retention-method-panel">
            <p className="section-label">นิยามการวิเคราะห์</p>
            <div className="retention-method-grid"><div><strong>Meaningful session</strong><span>{data.methodology?.meaningfulSession}</span></div><div><strong>ลูกค้าประจำ</strong><span>{data.methodology?.regular}</span></div><div><strong>Lapsed regular</strong><span>{data.methodology?.lapse}</span></div></div>
            <div className="retention-method-note">{data.methodology?.customerKey} · ลูกค้าที่มีเพียง 1 ครั้ง หรือมีแต่รายการสั้น/Retry จะยังไม่ถูกนับเป็นลูกค้าประจำและไม่ถูกนับเป็น churn</div>
          </section>
        </>
      )}
    </main>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";

type MonthlyRetention = {
  month: string;
  uniqueCustomers: number;
  meaningfulCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  regularCustomers: number;
  regularRate: number;
};

type PartnerRetentionData = {
  message?: string;
  range?: { from: string; to: string };
  kpis?: {
    uniqueCustomers: number;
    averageRepeatCustomers: number;
    averageRepeatRate: number;
    averageRegularCustomers: number;
    activeRegularCustomers: number;
    atRiskRegularCustomers: number;
    lapsedRegularCustomers: number;
    regularLapseRate: number;
    medianExpectedGapDays: number;
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
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}-01T00:00:00+07:00`));
}

export default function PartnerRetentionPage() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [data, setData] = useState<PartnerRetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/retention?from=${start}&to=${end}`, { cache: "no-store" });
      const result = await response.json() as PartnerRetentionData;
      if (!response.ok) throw new Error(result.message ?? "partner retention unavailable");
      setData(result);
    } catch (loadError) {
      console.error("Unable to load partner retention", loadError);
      setError("ยังไม่สามารถอ่านแนวโน้มการกลับมาใช้ซ้ำได้ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(DEFAULT_FROM, DEFAULT_TO); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const chartMax = useMemo(() => Math.max(...(data?.monthly ?? []).map((row) => row.regularCustomers), data?.kpis?.maxRegularCustomers ?? 0, 1), [data]);
  const cadenceMax = useMemo(() => Math.max(...(data?.cadenceBuckets ?? []).map((bucket) => bucket.count), 1), [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(from, to);
  }

  return (
    <main className="shell retention-shell partner-retention-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">PARTNER VIEW · CUSTOMER RETENTION</p>
        <h1>Customer Retention</h1>
        <p className="lede">ภาพรวมการกลับมาใช้ซ้ำของลูกค้าเพื่อวางแผนกิจกรรม partner แสดงจำนวน อัตรา และแนวโน้มรวมของการใช้บริการ</p>
      </section>

      <section className="partner-safe-banner"><span className="partner-safe-icon">✓</span><div><strong>Partner-safe view</strong><p>ใช้ดู customer behavior ระดับภาพรวม เหมาะสำหรับวางแผน campaign, CRM และกิจกรรมดึงลูกค้ากลับมา</p></div></section>

      <section className="panel retention-filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดต Retention</button>
        </form>
        <p className="hint drilldown-note">ข้อมูลที่แสดง: {data?.range ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : `${from} – ${to}`}</p>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังวิเคราะห์การกลับมาใช้ซ้ำ…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><button type="button" onClick={() => void load(from, to)}>ลองใหม่</button></section>}

      {data?.kpis && !loading && !error && (
        <>
          <section className="grid retention-kpi-grid partner-retention-kpi-grid">
            <article className="card"><p className="card-label">ผู้ใช้งานไม่ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)}<small> คน</small></p><p className="hint">รวมในช่วงเวลาที่เลือก</p></article>
            <article className="card"><p className="card-label">กลับมาใช้ซ้ำเฉลี่ย</p><p className="kpi-value">{formatNumber(data.kpis.averageRepeatRate, 1)}<small>%</small></p><p className="hint">อัตราเฉลี่ยรายเดือน</p></article>
            <article className="card"><p className="card-label">ลูกค้าประจำเฉลี่ย</p><p className="kpi-value">{formatNumber(data.kpis.averageRegularCustomers, 1)}<small> คน/เดือน</small></p><p className="hint">อย่างน้อย 3 ครั้งใน 30 วัน และกระจาย 2 สัปดาห์</p></article>
            <article className="card"><p className="card-label">รอบกลับมาใช้โดยทั่วไป</p><p className="kpi-value">{formatNumber(data.kpis.medianExpectedGapDays, 1)}<small> วัน</small></p><p className="hint">ค่ามัธยฐานของกลุ่มลูกค้าประจำ</p></article>
          </section>

          <section className="panel partner-decision-panel partner-retention-readout"><p className="section-label">RETENTION READOUT</p><h2>กลุ่มที่ควรใช้วางแผน CRM</h2><div className="partner-decision-grid"><div><span>ยัง Active</span><strong>{formatNumber(data.kpis.activeRegularCustomers)} คน</strong><small>ยังอยู่ในรอบการกลับมาใช้ของตนเอง</small></div><div><span>At risk</span><strong>{formatNumber(data.kpis.atRiskRegularCustomers)} คน</strong><small>เริ่มเกินรอบปกติ ควรติดตาม</small></div><div><span>Lapsed regular</span><strong>{formatNumber(data.kpis.lapsedRegularCustomers)} คน</strong><small>เหมาะกับแคมเปญ win-back</small></div><div><span>Regular lapse rate</span><strong>{formatNumber(data.kpis.regularLapseRate, 1)}%</strong><small>สัดส่วนลูกค้าประจำที่หลุดจากรอบ</small></div></div></section>

          <section className="content-grid retention-main-grid">
            <article className="panel">
              <div className="retention-panel-heading"><div><p className="section-label">MONTHLY RETENTION</p><h2>ลูกค้าประจำและอัตราการกลับมาใช้ซ้ำ</h2></div><span className="period-label">แนวโน้มรายเดือน</span></div>
              <div className="partner-retention-chart" role="img" aria-label="กราฟจำนวนลูกค้าประจำและอัตราการกลับมาใช้ซ้ำรายเดือน">
                {(data.monthly ?? []).map((row) => <div className="partner-retention-month" key={row.month} title={`${formatMonth(row.month)} · ลูกค้าประจำ ${formatNumber(row.regularCustomers)} คน · Repeat rate ${formatNumber(row.repeatRate, 1)}%`}><strong>{formatNumber(row.repeatRate, 1)}%</strong><i style={{ height: `${Math.max(5, row.regularCustomers / chartMax * 100)}%` }} /><span>{formatMonth(row.month)}</span><small>{formatNumber(row.regularCustomers)} regular</small></div>)}
              </div>
              <p className="chart-footnote">Repeat rate = ลูกค้าที่มี meaningful session ตั้งแต่ 2 ครั้งขึ้นไปในเดือนเดียวกัน · ผู้ใช้ครั้งเดียวไม่ถูกตีความเป็น churn</p>
            </article>

            <article className="panel">
              <div className="retention-panel-heading"><div><p className="section-label">CUSTOMER CADENCE</p><h2>รอบการกลับมาใช้</h2></div><span className="period-label">จำนวนลูกค้า</span></div>
              <div className="partner-retention-cadence">{(data.cadenceBuckets ?? []).map((bucket) => <div key={bucket.label}><span>{bucket.label}</span><div className="partner-track"><i style={{ width: `${bucket.count / cadenceMax * 100}%` }} /></div><strong>{formatNumber(bucket.count)}</strong></div>)}</div>
              <p className="chart-footnote">ใช้กำหนดจังหวะ reminder และข้อเสนอสำหรับกลุ่มที่เริ่มห่างจากรอบปกติ</p>
            </article>
          </section>

          <section className="panel retention-table-panel">
            <div className="retention-panel-heading"><div><p className="section-label">MONTHLY DETAIL</p><h2>รายละเอียดแนวโน้มการกลับมาใช้ซ้ำ</h2></div><span className="period-label">ตัวเลขรวมเท่านั้น</span></div>
            <div className="retention-table-wrap"><table className="retention-table partner-retention-table"><thead><tr><th>เดือน</th><th>ลูกค้าที่ใช้งาน</th><th>ลูกค้าใหม่</th><th>กลับมาใช้ซ้ำ</th><th>Repeat rate</th><th>ลูกค้าประจำ</th><th>Regular rate</th></tr></thead><tbody>{(data.monthly ?? []).map((row) => <tr key={row.month}><td><strong>{formatMonth(row.month)}</strong></td><td>{formatNumber(row.uniqueCustomers)}</td><td>{formatNumber(row.newCustomers)}</td><td className="retention-positive">{formatNumber(row.repeatCustomers)}</td><td>{formatNumber(row.repeatRate, 1)}%</td><td className="retention-positive">{formatNumber(row.regularCustomers)}</td><td>{formatNumber(row.regularRate, 1)}%</td></tr>)}</tbody></table></div>
          </section>

          <section className="panel partner-method-panel"><p className="section-label">นิยามสำหรับ partner</p><p>Meaningful session ใช้สำหรับแยกรายการสั้น/Retry ออกจากพฤติกรรมการกลับมาใช้ซ้ำ · ลูกค้าประจำต้องมีอย่างน้อย 3 ครั้งใน rolling 30 วัน และกระจายอย่างน้อย 2 สัปดาห์</p><p className="chart-footnote">การเปลี่ยนแพลตฟอร์ม One Charge เป็น PEA Volta ไม่ถูกใช้เป็นเงื่อนไขตัดข้อมูล</p></section>
        </>
      )}
    </main>
  );
}

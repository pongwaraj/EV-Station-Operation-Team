"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_FROM = "2026-07-31";
const DEFAULT_TO = "2026-09-16";

type MonthlyRetention = {
  month: string;
  sessions: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  oneTimeCustomers: number;
  churnEligible: number;
  churned: number;
  churnRate: number;
  churnPending: number;
};

type RetentionData = {
  message?: string;
  range?: { from: string; to: string };
  observationEnd?: string;
  observationEndDate?: string;
  methodology?: { repeat: string; churn: string; customerKey: string };
  kpis?: {
    sessions: number;
    knownSessions: number;
    unknownSessions: number;
    uniqueCustomers: number;
    averageRepeatCustomers: number;
    averageRepeatRate: number;
    churnRate: number;
    churned: number;
    churnEligible: number;
    maxRepeatCustomers: number;
  };
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
      setError("ยังไม่สามารถแสดงข้อมูลลูกค้าซ้ำได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRetention(DEFAULT_FROM, DEFAULT_TO); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRetention]);

  const chartMax = useMemo(() => Math.max(data?.kpis?.maxRepeatCustomers ?? 0, data?.kpis?.averageRepeatCustomers ?? 0, 1), [data]);
  const averageLinePosition = ((data?.kpis?.averageRepeatCustomers ?? 0) / chartMax) * 100;
  const highestRepeatMonth = useMemo(() => [...(data?.monthly ?? [])].sort((a, b) => b.repeatCustomers - a.repeatCustomers)[0], [data]);
  const highestChurnMonth = useMemo(() => [...(data?.monthly ?? [])].filter((row) => row.churnEligible > 0).sort((a, b) => b.churnRate - a.churnRate)[0], [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadRetention(from, to);
  }

  return (
    <main className="shell retention-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">CUSTOMER RETENTION</p>
        <h1>ลูกค้ากลับมาใช้ซ้ำและ Churn</h1>
        <p className="lede">วิเคราะห์การกลับมาชาร์จซ้ำหลังเปลี่ยนแพลตฟอร์ม เพื่อให้ผู้บริหารเห็นคุณภาพฐานลูกค้าและสัญญาณการหายไปของลูกค้า</p>
      </section>

      <section className="panel retention-filter-panel">
        <form className="filter-form" onSubmit={submit}>
          <label>ตั้งแต่<input type="date" value={from} min={DEFAULT_FROM} max={DEFAULT_TO} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>ถึง<input type="date" value={to} min={DEFAULT_FROM} max={DEFAULT_TO} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>อัปเดตการวิเคราะห์</button>
        </form>
        <div className="retention-range-note">ช่วงข้อมูลเริ่มต้น: 31 ก.ค. 2569 – 16 ก.ย. 2569 · ใช้ V ID/Customer ID ของ PEA Volta เป็น customer key</div>
      </section>

      {loading && <section className="panel loading-state"><p>กำลังวิเคราะห์พฤติกรรมการกลับมาใช้ซ้ำ…</p></section>}
      {error && <section className="panel error-state" role="alert"><strong>{error}</strong><p className="hint">หากหน้าอื่นก็แสดงสถานะรอเชื่อมต่อข้อมูล ให้ตั้งค่า DATABASE_URL ในระบบ production</p><button type="button" onClick={() => void loadRetention(from, to)}>ลองใหม่</button></section>}

      {data?.kpis && !loading && !error && (
        <>
          <div className="retention-period-line">
            <span>ข้อมูลที่แสดง: {data.range ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : "-"}</span>
            <span>Churn 7 วันคำนวณได้ถึง {data.observationEndDate ? formatDate(`${data.observationEndDate}T00:00:00+07:00`) : "-"}</span>
          </div>

          <section className="grid retention-kpi-grid">
            <article className="card"><p className="card-label">ค่าเฉลี่ยลูกค้ากลับมาใช้ซ้ำ</p><p className="kpi-value">{formatNumber(data.kpis.averageRepeatCustomers, 1)} <small>คน/เดือน</small></p><p className="hint">ชาร์จตั้งแต่ 2 ครั้งขึ้นไปในเดือนเดียวกัน</p></article>
            <article className="card"><p className="card-label">อัตรากลับมาใช้ซ้ำเฉลี่ย</p><p className="kpi-value">{formatNumber(data.kpis.averageRepeatRate, 1)}<small>%</small></p><p className="hint">เทียบกับลูกค้าที่มีการใช้งานในแต่ละเดือน</p></article>
            <article className="card"><p className="card-label">Churn rate ภายใน 7 วัน</p><p className="kpi-value">{formatNumber(data.kpis.churnRate, 1)}<small>%</small></p><p className="hint">{formatNumber(data.kpis.churned)} จาก {formatNumber(data.kpis.churnEligible)} คนที่มีข้อมูลติดตามครบ</p></article>
            <article className="card"><p className="card-label">ลูกค้าที่วิเคราะห์ได้</p><p className="kpi-value">{formatNumber(data.kpis.uniqueCustomers)} <small>คน</small></p><p className="hint">ไม่รวม {formatNumber(data.kpis.unknownSessions)} session ที่ไม่มี Customer ID</p></article>
          </section>

          <section className="content-grid retention-main-grid">
            <article className="panel">
              <div className="retention-panel-heading"><div><p className="section-label">MONTHLY REPEAT CUSTOMERS</p><h2>ลูกค้าที่กลับมาใช้ซ้ำในเดือนเดียวกัน</h2></div><span className="chart-legend"><i className="repeat-key" /> ลูกค้าซ้ำ <i className="average-key-retention" /> ค่าเฉลี่ย</span></div>
              <div className="retention-chart" role="img" aria-label="กราฟจำนวนลูกค้าที่กลับมาใช้ซ้ำรายเดือน เทียบกับค่าเฉลี่ย">
                <div className="retention-scale"><span>{formatNumber(chartMax)}</span><span>0</span></div>
                <div className="retention-chart-body">
                  <div className="retention-average-line" style={{ bottom: `${averageLinePosition}%` }}><span>เฉลี่ย {formatNumber(data.kpis.averageRepeatCustomers, 1)} คน</span></div>
                  <div className="retention-bars">
                    {(data.monthly ?? []).map((row) => <div className="retention-bar-group" key={row.month} title={`${formatMonth(row.month)} · ${formatNumber(row.repeatCustomers)} คน · ${formatNumber(row.repeatRate, 1)}%`}><div className="retention-bar-value">{formatNumber(row.repeatCustomers)}</div><div className="retention-bar" style={{ height: `${(row.repeatCustomers / chartMax) * 100}%` }} /><span>{formatMonth(row.month)}</span></div>)}
                  </div>
                </div>
              </div>
              <p className="chart-footnote">ค่าเฉลี่ยคิดจากจำนวนลูกค้าซ้ำของแต่ละเดือนในช่วงวันที่เลือก โดยเดือน ก.ค. และ ก.ย. เป็นข้อมูลบางส่วน</p>
            </article>

            <article className="panel retention-executive-panel">
              <p className="section-label">EXECUTIVE READOUT</p>
              <h2>สิ่งที่ผู้บริหารควรเห็น</h2>
              <div className="retention-readout-list">
                <div><span>เดือนที่มีลูกค้าซ้ำสูงสุด</span><strong>{highestRepeatMonth ? `${formatMonth(highestRepeatMonth.month)} · ${formatNumber(highestRepeatMonth.repeatCustomers)} คน` : "-"}</strong><small>Repeat rate {highestRepeatMonth ? `${formatNumber(highestRepeatMonth.repeatRate, 1)}%` : "-"}</small></div>
                <div><span>เดือนที่มี Churn สูงสุด</span><strong>{highestChurnMonth ? `${formatMonth(highestChurnMonth.month)} · ${formatNumber(highestChurnMonth.churnRate, 1)}%` : "รอข้อมูลครบ 7 วัน"}</strong><small>{highestChurnMonth ? `${formatNumber(highestChurnMonth.churned)} คนจาก ${formatNumber(highestChurnMonth.churnEligible)} คน` : "เดือนล่าสุดยังมีช่วงติดตามไม่ครบ"}</small></div>
                <div><span>ความหมายของ Churn</span><strong>ใช้ครั้งเดียวแล้วไม่กลับมาภายใน 7 วัน</strong><small>เป็นสัญญาณติดตาม ไม่ใช่การยืนยันว่าลูกค้าสูญเสียถาวร</small></div>
              </div>
            </article>
          </section>

          <section className="panel retention-table-panel">
            <div className="retention-panel-heading"><div><p className="section-label">MONTHLY DETAIL</p><h2>ตารางสรุปเพื่อเทียบแนวโน้ม</h2></div><span className="hint">ตัวเลข Churn ของเดือนล่าสุดจะแสดงเฉพาะกลุ่มที่มีข้อมูลติดตามครบ 7 วัน</span></div>
            <div className="retention-table-wrap">
              <table className="retention-table">
                <thead><tr><th>เดือน</th><th>ลูกค้าที่ใช้งาน</th><th>กลับมาใช้ซ้ำ<br /><small>≥ 2 ครั้ง</small></th><th>Repeat rate</th><th>ใช้ครั้งเดียว</th><th>Churned<br /><small>เกิน 7 วัน</small></th><th>Churn rate</th><th>รอติดตาม</th></tr></thead>
                <tbody>{(data.monthly ?? []).map((row) => <tr key={row.month}><td><strong>{formatMonth(row.month)}</strong></td><td>{formatNumber(row.uniqueCustomers)}</td><td className="retention-positive">{formatNumber(row.repeatCustomers)}</td><td>{formatNumber(row.repeatRate, 1)}%</td><td>{formatNumber(row.oneTimeCustomers)}</td><td className="retention-warning">{formatNumber(row.churned)} / {formatNumber(row.churnEligible)}</td><td>{row.churnEligible ? `${formatNumber(row.churnRate, 1)}%` : "-"}</td><td>{formatNumber(row.churnPending)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="panel retention-method-panel">
            <p className="section-label">นิยามการวิเคราะห์</p>
            <div className="retention-method-grid"><div><strong>ลูกค้ากลับมาใช้ซ้ำ</strong><span>{data.methodology?.repeat}</span></div><div><strong>Churn rate</strong><span>{data.methodology?.churn}</span></div><div><strong>ข้อจำกัด</strong><span>รายการหลัง {data.observationEndDate ? formatDate(`${data.observationEndDate}T00:00:00+07:00`) : "วันที่คำนวณได้"} ยังไม่มีข้อมูลครบ 7 วัน จึงแสดงเป็น “รอติดตาม”</span></div></div>
          </section>
        </>
      )}
    </main>
  );
}

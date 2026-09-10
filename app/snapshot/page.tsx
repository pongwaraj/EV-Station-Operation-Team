"use client";

import "./snapshot.css";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Overview = { kpis: { sessions: number; energyKwh: number; revenueThb: number; uniqueCustomers: number; shortSessions: number; shortSessionRate: number; avgDurationMinutes: number; averageEnergyPerSession: number }; trend: { date: string; sessions: number }[]; peakHours: { hour: number; sessions: number }[]; imports: { lastImportAt: string | null } };
type Experience = { summary: { total: number; noRecoveryObserved: number }; items: { startAt: string; recoveryAt: string | null; recoveryGapMinutes: number | null; recoveryKwh: number | null; recoveryPath: string }[] };
type Alarms = { summary: { total: number; incidents: number; active: number; impactedSessions: number }; topCauses: { code: string; reason: string; incidentCount: number; deviceCount: number }[]; items: { impactedShortSessionIds: string[] }[] };
type Report = { date: string; baselineFrom: string; baselineTo: string; overview: Overview; baseline: Overview; experience: Experience; alarms: Alarms; generatedAt: string };
const day = (date: Date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const shift = (value: string, days: number) => day(new Date(new Date(`${value}T00:00:00+07:00`).getTime() + days * 86400000));
const fmt = (n: number, digits = 0) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: digits }).format(n);
const dateLabel = (value: string) => new Date(`${value}T00:00:00+07:00`).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const delta = (value: number, total: number) => total > 0 ? `${value >= total / 7 ? "สูงกว่า" : "ต่ำกว่า"}เฉลี่ย 7 วัน ${fmt(Math.abs((value / (total / 7) - 1) * 100), 1)}%` : "ไม่มีฐานเปรียบเทียบ";

export default function SnapshotPage() {
  const [date, setDate] = useState(() => shift(day(new Date()), -1));
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [capture, setCapture] = useState(false);
  async function load(selected: string) {
    setBusy(true); setError(""); setReport(null);
    try {
      const baselineFrom = shift(selected, -7), baselineTo = shift(selected, -1);
      async function get<T,>(path: string, from = selected, to = selected): Promise<T> {
        const response = await fetch(`/api/dashboard/${path}?from=${from}&to=${to}&limit=500`, { cache: "no-store" });
        if (!response.ok) throw new Error("อ่านข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง");
        return response.json() as Promise<T>;
      }
      const [overview, baseline, experience, alarms] = await Promise.all([get<Overview>("overview"), get<Overview>("overview", baselineFrom, baselineTo), get<Experience>("abnormal-sessions"), get<Alarms>("alarms")]);
      setReport({ date: selected, baselineFrom, baselineTo, overview, baseline, experience, alarms, generatedAt: new Date().toISOString() });
    } catch { setError("โหลดข้อมูลไม่ครบ กรุณาลองใหม่ก่อนส่งรายงาน"); }
    finally { setBusy(false); }
  }
  useEffect(() => { const timer = setTimeout(() => void load(shift(day(new Date()), -1)), 0); return () => clearTimeout(timer); }, []);
  const k = report?.overview.kpis;
  const a = report?.alarms.summary;
  const items = report?.experience.items ?? [];
  const sameDay = items.filter(i => i.recoveryAt && day(new Date(i.recoveryAt)) === report?.date).length;
  const later = items.filter(i => i.recoveryAt && day(new Date(i.recoveryAt)) !== report?.date).length;
  const quick = items.filter(i => i.recoveryAt && (i.recoveryGapMinutes ?? Infinity) <= 5).length;
  const noRecovery = report?.experience.summary.noRecoveryObserved ?? 0;
  const cause = report?.alarms.topCauses[0];
  const peak = [...(report?.overview.peakHours ?? [])].sort((x, y) => y.sessions - x.sessions)[0];
  const shortOverlap = new Set(report?.alarms.items.flatMap(i => i.impactedShortSessionIds) ?? []).size;
  const baselineDays = report?.baseline.trend.filter(i => i.sessions > 0).length ?? 0;
  return <main className={`snapshot-shell${capture ? " snapshot-capture" : ""}`}>
    <div className="snapshot-controls">
      <form onSubmit={e => { e.preventDefault(); void load(date); }}><label>วันที่รายงาน <input aria-label="วันที่รายงาน" type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><button disabled={busy}>แสดง Snapshot</button></form>
      <button onClick={() => setCapture(!capture)} disabled={!report}>{capture ? "กลับโหมดปกติ" : "โหมดจับภาพ"}</button>
      <button onClick={() => window.print()} disabled={!report}>พิมพ์ / บันทึก PDF</button>
    </div>
    {busy && <p role="status">กำลังจัดทำรายงาน…</p>}{error && <p role="alert">{error}</p>}
    {report && k && a && <article className="snapshot-sheet">
      <header className="snapshot-heading"><Image src="/tce-logo.png" alt="TCE" width={100} height={66} /><div><p>TCE ChargeX · Daily Service Snapshot</p><h1>Meta Mall <span>{dateLabel(report.date)}</span></h1></div></header>
      <div className={`snapshot-status ${a.active || noRecovery ? "watch" : "recovered"}`}><strong>{!k.sessions ? "ยังไม่พบรายการชาร์จในวันที่เลือก" : a.active || noRecovery ? "มีประเด็นที่ควรติดตาม" : "พบการให้บริการ · ไม่พบเคสค้างในรายการวันที่เลือก"}</strong><span>{a.active} สัญญาณเตือนยังไม่ปิด · {noRecovery} เหตุการณ์ยังไม่พบกลับมาชาร์จสำเร็จ</span></div>
      <section className="snapshot-kpis">
        {[{ label: "การชาร์จทั้งหมด", value: fmt(k.sessions), unit: "ครั้ง", comparison: delta(k.sessions, report.baseline.kpis.sessions) }, { label: "พลังงานที่จ่าย", value: fmt(k.energyKwh, 1), unit: "kWh", comparison: delta(k.energyKwh, report.baseline.kpis.energyKwh) }, { label: "รายได้คำนวณ", value: fmt(k.revenueThb), unit: "บาท", comparison: delta(k.revenueThb, report.baseline.kpis.revenueThb) }, { label: "ผู้ใช้งานไม่ซ้ำ", value: fmt(k.uniqueCustomers), unit: "รหัส", comparison: "ตามรหัสลูกค้าในระบบ" }].map(m => <div key={m.label}><span>{m.label}</span><strong>{m.value} <small>{m.unit}</small></strong><small>{m.comparison}</small></div>)}
      </section>
      <p className="snapshot-strip">เฉลี่ย {fmt(k.averageEnergyPerSession, 1)} kWh/ครั้ง · {fmt(k.avgDurationMinutes, 1)} นาที/ครั้ง · ช่วงเริ่มชาร์จสูงสุด {peak ? `${String(peak.hour).padStart(2, "0")}:00–${String(peak.hour).padStart(2, "0")}:59 น. (${peak.sessions} ครั้ง)` : "ไม่มีข้อมูล"}</p>
      <div className="snapshot-columns">
        <section><h2>ประสบการณ์ลูกค้า</h2><p className="snapshot-big">{k.shortSessions} <small>ชาร์จสั้น / {k.sessions} ครั้ง ({fmt(k.shortSessionRate, 1)}%)</small></p><dl><div><dt>กลับมาสำเร็จภายในวัน</dt><dd>{sameDay} เหตุการณ์</dd></div><div><dt>ในจำนวนนี้ ภายใน 5 นาที</dt><dd>{items.filter(i => i.recoveryAt && day(new Date(i.recoveryAt)) === report.date && (i.recoveryGapMinutes ?? Infinity) <= 5).length}</dd></div><div><dt>กลับมาสำเร็จหลังวันรายงาน</dt><dd>{later}</dd></div><div><dt>ยังไม่พบกลับมาสำเร็จ</dt><dd>{noRecovery}</dd></div></dl>
        {items.length === 1 && items[0].recoveryAt && <p className="snapshot-note">เคสที่พบกลับมาชาร์จ{items[0].recoveryPath === "same_connector" ? "หัวเดิม" : "อีกครั้ง"}ใน {fmt(items[0].recoveryGapMinutes ?? 0, 1)} นาที จ่ายพลังงาน {fmt(items[0].recoveryKwh ?? 0, 2)} kWh</p>}
        </section>
        <section><h2>สัญญาณเตือนจากอุปกรณ์</h2><p className="snapshot-big">{a.total} <small>รายการ → {a.incidents} กลุ่มเหตุการณ์</small></p><dl><div><dt>สัญญาณเตือนยังไม่ปิด</dt><dd>{a.active} รายการ</dd></div><div><dt>Session ซ้อนช่วง Alarm (ไม่ซ้ำ)</dt><dd>{a.impactedSessions}</dd></div><div><dt>ชาร์จสั้นซ้อนช่วง Alarm</dt><dd>{shortOverlap}</dd></div></dl><p className="snapshot-note">{cause ? `พบมากสุด Code ${cause.code} · ${cause.reason} (${cause.incidentCount} กลุ่ม / ${cause.deviceCount} คู่ตู้–หัวชาร์จ)` : "ไม่พบสัญญาณเตือนที่เริ่มในวันที่เลือก"}</p></section>
      </div>
      <section className="snapshot-actions"><h2>ข้อสรุปและสิ่งที่ควรดำเนินการ</h2><p>{k.sessions ? `มีการใช้งาน ${fmt(k.sessions)} ครั้ง พบชาร์จสั้น ${k.shortSessions} ครั้ง และกลับมาสำเร็จภายใน 5 นาที ${quick} เหตุการณ์` : "ตรวจสอบความครบถ้วนของไฟล์นำเข้าและสถานะสถานี ก่อนสรุปว่าไม่มีการใช้งาน"}.</p><p><strong>ทีมปฏิบัติการ:</strong> {noRecovery ? `ตรวจหลักฐาน ${noRecovery} เหตุการณ์ที่ยังไม่พบกลับมาสำเร็จ และพิจารณาดูแลลูกค้าตามช่องทางที่มีสิทธิ` : "ติดตามเคส retry และขั้นตอนเริ่มชาร์จ"} · <strong>ทีมวิศวกรรม:</strong> {a.active ? `ตรวจและยืนยันสถานะ Alarm ที่ยังไม่ปิด ${a.active} รายการ` : cause ? `ตรวจแนวโน้ม Code ${cause.code} และผลตรวจอุปกรณ์` : "ติดตามสถานะอุปกรณ์ตามรอบ"}</p></section>
      <footer className="snapshot-foot"><p>ฐานเปรียบเทียบ: {dateLabel(report.baselineFrom)}–{dateLabel(report.baselineTo)} รวมยอด ÷ 7 วัน · พบรายการชาร์จ {baselineDays}/7 วัน{baselineDays < 7 ? " (ควรตรวจความครบถ้วนของข้อมูล)" : ""} · รายได้ = kWh × 7.90 บาท</p><p>ชาร์จสั้น = น้อยกว่า 60 วินาที หรือ 1 kWh · Recovery = ครั้งถัดไป ≥60 วินาที และ ≥1 kWh ตามข้อมูลที่นำเข้าล่าสุด · ไม่พบ recovery ไม่เท่ากับเสียลูกค้า</p><p>Alarm ซ้อนเวลาเป็นความสัมพันธ์ ไม่ยืนยันสาเหตุ · สถานะอ้างอิงเหตุที่เริ่มในวันที่เลือก ไม่รวมเคสเริ่มก่อนวันรายงาน · ยังยืนยัน Uptime / Downtime และหัวพร้อมใช้ไม่ได้จากข้อมูลชุดนี้</p><p>นำเข้าล่าสุด {report.overview.imports.lastImportAt ? new Date(report.overview.imports.lastImportAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่ระบุ"} · จัดทำ {new Date(report.generatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p></footer>
    </article>}
    {report && <nav className="snapshot-controls"><Link href={`/abnormal-sessions?from=${report.date}&to=${report.date}`}>ดูหลักฐานการชาร์จ</Link><Link href={`/alarms?from=${report.date}&to=${report.date}`}>ดูรายละเอียด Alarm</Link></nav>}
  </main>;
}

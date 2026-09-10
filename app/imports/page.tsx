"use client";

import { ChangeEvent, FormEvent, useState } from "react";

type SourceType = "charging_sessions" | "billing_transactions" | "charger_alarms" | "status_events" | "station_info" | "device_management";
type Report = {
  message?: string;
  fileName?: string;
  totalRows?: number;
  invalidRows?: number;
  duplicateWithinFile?: number;
  duplicateInDatabase?: number;
  readyToImport?: number;
  acceptedRows?: number;
  normalizedRows?: number;
  normalizationIssues?: number;
  duplicateRows?: number;
  databaseConfigured?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: string;
  sample?: Array<{ rowNumber: number; timestamp: string | null; station: string | null; entity: string | null; state: string }>;
};

const sourceOptions: Array<{ value: SourceType; label: string }> = [
  { value: "charging_sessions", label: "ประวัติการชาร์จ" },
  { value: "billing_transactions", label: "ยอดใช้งานและรายได้" },
  { value: "charger_alarms", label: "ประวัติ Alarm" },
  { value: "status_events", label: "สถานะการทำงาน" },
  { value: "station_info", label: "ข้อมูลสถานี (Station Info)" },
  { value: "device_management", label: "ข้อมูลอุปกรณ์ (Device Management)" },
];

function displayDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function displayState(value: string) {
  if (value === "ready") return "พร้อมนำเข้า";
  if (value === "duplicate_in_database") return "มีข้อมูลแล้ว";
  return value;
}

export default function ImportsPage() {
  const [sourceType, setSourceType] = useState<SourceType>("charging_sessions");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setReport(null);
    setError("");
  }

  async function submit(event: FormEvent, endpoint: string) {
    event.preventDefault();
    if (!file) {
      setError("กรุณาเลือกไฟล์ .xlsx, .xls หรือ .csv ก่อน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sourceType", sourceType);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const result = (await response.json()) as Report;
      if (!response.ok) throw new Error("ไม่สามารถดำเนินการได้ในขณะนี้");
      setReport(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <p className="eyebrow">TCE CHARGEX</p>
        <h1>นำเข้าข้อมูลสถานี</h1>
        <p className="lede">อัปโหลดไฟล์รายวันหรือรายเดือน ระบบจะตรวจสอบข้อมูลซ้ำก่อนบันทึกทุกครั้ง</p>
      </section>

      <section className="process-steps" aria-label="ขั้นตอนการนำเข้าข้อมูล">
        <div className="process-step"><span>1</span><strong>เลือกไฟล์</strong><small>ไฟล์ Excel หรือ CSV</small></div>
        <div className="process-step"><span>2</span><strong>ตรวจสอบข้อมูล</strong><small>ตรวจวันเวลาและรายการซ้ำ</small></div>
        <div className="process-step"><span>3</span><strong>นำเข้า</strong><small>บันทึกเฉพาะรายการใหม่</small></div>
      </section>

      <section className="panel import-panel">
        <form onSubmit={(event) => submit(event, "/api/imports/preview")}>
          <div className="form-grid">
            <label>
              ประเภทข้อมูล
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)}>
                {sourceOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              ไฟล์รายวันหรือรายเดือน
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} />
            </label>
          </div>
          <div className="button-row">
            <button type="submit" disabled={busy}>{busy ? "กำลังตรวจสอบ..." : "ตรวจสอบก่อนนำเข้า"}</button>
            <button className="secondary-button" type="button" disabled={busy || !report || !file} onClick={(event) => submit(event, "/api/imports")}>
              นำเข้าเฉพาะรายการใหม่
            </button>
          </div>
        </form>
        <p className="hint">ไฟล์เดือนเดียวกันกับไฟล์รายวันสามารถอัปโหลดซ้ำได้ ระบบจะข้ามรายการที่มีข้อมูลเดิมโดยอัตโนมัติ</p>
        {error && <p className="error-box">{error}</p>}
      </section>

      {report && (
        <section className="report-grid">
          <article className="panel report-panel">
            <p className="section-label">ผลการตรวจสอบ</p>
            <h2>{report.status === "completed" ? "นำเข้าเสร็จแล้ว" : report.status === "completed_with_warnings" ? "นำเข้าเสร็จแล้ว มีรายการที่ควรตรวจสอบ" : "ตรวจสอบข้อมูลแล้ว"}</h2>
            <div className="metric-list">
              <span>แถวทั้งหมด <strong>{report.totalRows ?? 0}</strong></span>
              <span>พร้อมนำเข้า <strong>{report.readyToImport ?? report.acceptedRows ?? 0}</strong></span>
              {report.status === "completed" || report.status === "completed_with_warnings" ? <span>บันทึกข้อมูลแล้ว <strong>{report.normalizedRows ?? 0}</strong></span> : null}
              <span>ซ้ำในไฟล์ <strong>{report.duplicateWithinFile ?? 0}</strong></span>
              <span>ข้อมูลซ้ำที่มีอยู่แล้ว <strong>{report.duplicateInDatabase ?? report.duplicateRows ?? 0}</strong></span>
              <span>ไม่ผ่านการตรวจสอบ <strong>{report.invalidRows ?? 0}</strong></span>
            </div>
            <p className="hint">ช่วงข้อมูล: {displayDate(report.periodStart)} — {displayDate(report.periodEnd)}</p>
            {(report.status === "completed" || report.status === "completed_with_warnings") && <p className="success-box">{report.message}</p>}
            {report.databaseConfigured === false && <p className="hint">ตรวจสอบข้อมูลเรียบร้อยแล้ว ขณะนี้ระบบยังไม่พร้อมบันทึกข้อมูล กรุณาลองใหม่ภายหลัง</p>}
          </article>
          <article className="panel report-panel">
            <p className="section-label">ตัวอย่างข้อมูล</p>
            <div className="sample-table-wrap">
              <table>
                <thead><tr><th>แถว</th><th>วันเวลา</th><th>สถานี</th><th>รายการ</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {(report.sample ?? []).map((row) => <tr key={`${row.rowNumber}-${row.timestamp}`}><td>{row.rowNumber}</td><td>{displayDate(row.timestamp)}</td><td>{row.station ?? "-"}</td><td>{row.entity ?? "-"}</td><td>{displayState(row.state)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

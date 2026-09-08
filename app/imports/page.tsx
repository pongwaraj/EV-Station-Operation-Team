"use client";

import { ChangeEvent, FormEvent, useState } from "react";

type SourceType = "charging_sessions" | "billing_transactions" | "charger_alarms" | "status_events";
type Report = {
  message?: string;
  fileName?: string;
  totalRows?: number;
  invalidRows?: number;
  duplicateWithinFile?: number;
  duplicateInDatabase?: number;
  readyToImport?: number;
  acceptedRows?: number;
  duplicateRows?: number;
  databaseConfigured?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: string;
  sample?: Array<{ rowNumber: number; timestamp: string | null; station: string | null; entity: string | null; state: string }>;
};

const sourceOptions: Array<{ value: SourceType; label: string }> = [
  { value: "charging_sessions", label: "Order / Charging session" },
  { value: "billing_transactions", label: "Billing / Dashboard export" },
  { value: "charger_alarms", label: "Charger alarm" },
  { value: "status_events", label: "Status / uptime" },
];

function displayDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
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
      if (!response.ok) throw new Error(result.message ?? "ดำเนินการไม่สำเร็จ");
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
        <p className="eyebrow">TCE EV OPERATIONS / DATA INTAKE</p>
        <h1>นำเข้าข้อมูลรายวันหรือรายเดือน</h1>
        <p className="lede">เลือกประเภทไฟล์ ระบบจะตรวจสอบ timestamp และรายการซ้ำก่อนนำเข้า DB ทุกครั้ง</p>
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
        <p className="hint">ไฟล์เดือนเดียวกันกับไฟล์รายวันสามารถอัปโหลดซ้ำได้ ระบบจะข้ามรายการที่มี source key เดิมโดยอัตโนมัติ</p>
        {error && <p className="error-box">{error}</p>}
      </section>

      {report && (
        <section className="report-grid">
          <article className="panel report-panel">
            <p className="section-label">Preflight result</p>
            <h2>{report.status === "completed" ? "นำเข้าเสร็จแล้ว" : "ผลการตรวจสอบ"}</h2>
            <div className="metric-list">
              <span>แถวทั้งหมด <strong>{report.totalRows ?? 0}</strong></span>
              <span>พร้อมนำเข้า <strong>{report.readyToImport ?? report.acceptedRows ?? 0}</strong></span>
              <span>ซ้ำในไฟล์ <strong>{report.duplicateWithinFile ?? 0}</strong></span>
              <span>ซ้ำใน DB <strong>{report.duplicateInDatabase ?? report.duplicateRows ?? 0}</strong></span>
              <span>ไม่ผ่าน timestamp <strong>{report.invalidRows ?? 0}</strong></span>
            </div>
            <p className="hint">ช่วงข้อมูล: {displayDate(report.periodStart)} — {displayDate(report.periodEnd)}</p>
            {report.status === "completed" && <p className="success-box">{report.message}</p>}
            {report.databaseConfigured === false && <p className="hint">Preview ทำงานได้ แต่ยังนำเข้าจริงไม่ได้จนกว่าจะตั้งค่า DATABASE_URL</p>}
          </article>
          <article className="panel report-panel">
            <p className="section-label">Sample rows</p>
            <div className="sample-table-wrap">
              <table>
                <thead><tr><th>Row</th><th>Timestamp</th><th>Station</th><th>Entity</th><th>State</th></tr></thead>
                <tbody>
                  {(report.sample ?? []).map((row) => <tr key={`${row.rowNumber}-${row.timestamp}`}><td>{row.rowNumber}</td><td>{displayDate(row.timestamp)}</td><td>{row.station ?? "-"}</td><td>{row.entity ?? "-"}</td><td>{row.state}</td></tr>)}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

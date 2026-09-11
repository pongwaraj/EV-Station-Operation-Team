"use client";

export default function RecordFilter({ query, onQuery, status, onStatus, options, shown, total }: {
  query: string; onQuery: (value: string) => void;
  status: string; onStatus: (value: string) => void;
  options: { value: string; label: string }[]; shown: number; total: number;
}) {
  return <div className="record-filter">
    <label>ค้นหาในรายการ<input type="search" placeholder="ค้นหาตู้ หัวชาร์จ หรือรายละเอียด…" value={query} onChange={e => onQuery(e.target.value)} /></label>
    <label>สถานะ<select value={status} onChange={e => onStatus(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    <span role="status" aria-live="polite">{shown.toLocaleString("th-TH")} / {total.toLocaleString("th-TH")} รายการที่โหลด</span>
    {(query || status !== "all") && <button className="secondary-button" type="button" onClick={() => { onQuery(""); onStatus("all"); }}>ล้างตัวกรอง</button>}
  </div>;
}

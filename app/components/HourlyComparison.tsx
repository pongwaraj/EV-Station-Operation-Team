type Hour = { hour: number; sessions: number };
export default function HourlyComparison({ current, baseline }: { current: Hour[]; baseline: Hour[] }) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour, current: current.find(i => i.hour === hour)?.sessions ?? 0,
    average: (baseline.find(i => i.hour === hour)?.sessions ?? 0) / 7,
  }));
  const maximum = Math.max(1, Math.ceil(Math.max(...rows.flatMap(i => [i.current, i.average]))));
  return <section className="hourly-comparison">
    <div className="hourly-heading"><h2>การเริ่มชาร์จในแต่ละช่วงเวลา</h2><span className="hourly-legend"><i className="actual-key" />วันรายงาน <i className="average-key" />เฉลี่ย 7 วันก่อนหน้า</span></div>
    <svg viewBox="0 0 960 195" role="img" aria-label="กราฟแท่งซ้อน จำนวนครั้งเริ่มชาร์จรายชั่วโมง เทียบค่าเฉลี่ย 7 วันก่อนหน้า เวลาไทย">
      <text x="0" y="12" className="chart-text">ครั้ง</text>
      {[0, .5, 1].map(f => <g key={f}><line x1="32" x2="952" y1={155 - f * 125} y2={155 - f * 125} className="hour-grid" /><text x="25" y={159 - f * 125} textAnchor="end" className="chart-text">{Number((maximum * f).toFixed(1))}</text></g>)}
      {rows.map(row => {
        const x = 34 + row.hour * 38;
        return <g key={row.hour}><title>{String(row.hour).padStart(2, "0")}:00–{String(row.hour).padStart(2, "0")}:59 · {row.current} ครั้ง · เฉลี่ย {row.average.toFixed(2)} ครั้ง/วัน</title>
          <rect x={x + 2} y={155 - row.average / maximum * 125} width="29" height={row.average / maximum * 125} rx="2" className="hour-average" />
          <rect x={x + 9} y={155 - row.current / maximum * 125} width="15" height={row.current / maximum * 125} rx="2" className="hour-actual" />
          <text x={x + 16} y="175" textAnchor="middle" className="chart-text">{String(row.hour).padStart(2, "0")}</text>
        </g>;
      })}
      <text x="952" y="192" textAnchor="end" className="chart-text">ชั่วโมง · Asia/Bangkok</text>
    </svg>
    <p className="hourly-note">แท่งกว้าง = ค่าเฉลี่ย • แท่งแคบซ้อนด้านหน้า = วันรายงาน • นับตามชั่วโมงเริ่ม session รวม retry</p>
    <details className="hourly-values"><summary>ดูตัวเลขรายชั่วโมง</summary><table><thead><tr><th>เวลา</th><th>วันรายงาน (ครั้ง)</th><th>เฉลี่ย (ครั้ง/วัน)</th></tr></thead><tbody>{rows.map(r => <tr key={r.hour}><td>{String(r.hour).padStart(2, "0")}:00</td><td>{r.current}</td><td>{r.average.toFixed(2)}</td></tr>)}</tbody></table></details>
  </section>;
}

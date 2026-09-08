const readiness = [
  { label: "Web application", value: "Foundation ready", tone: "ready" },
  { label: "Neon database", value: "Schema prepared", tone: "ready" },
  { label: "Raw data protection", value: "GitHub excluded", tone: "ready" },
  { label: "Dashboard data", value: "Import preflight ready", tone: "ready" },
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">TCE EV OPERATIONS</p>
        <h1>EV Station Operations Dashboard</h1>
        <p className="lede">
          Foundation สำหรับวิเคราะห์สถานี Meta Mall โดยแยก Source Code, Raw Files และ Database
          ออกจากกันตั้งแต่ต้น
        </p>
        <div className="meta-row">
          <span className="pill">Round 2: Import control</span>
          <span className="muted">ตรวจซ้ำด้วย timestamp ก่อนนำเข้า</span>
        </div>
      </section>

      <section className="grid" aria-label="Stack readiness">
        {readiness.map((item) => (
          <article className="card" key={item.label}>
            <p className="card-label">{item.label}</p>
            <p className={`status ${item.tone}`}>{item.value}</p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel">
          <p className="section-label">Next round</p>
          <h2>นำเข้าข้อมูลแบบตรวจสอบย้อนกลับได้</h2>
          <p>
            ระบบจะเก็บไฟล์ต้นฉบับไว้ใน Private Storage และนำข้อมูลที่ผ่านการตรวจสอบเข้า Neon
            โดยไม่เก็บไฟล์ลูกค้าไว้ใน GitHub
          </p>
        </article>
        <article className="panel dark-panel">
          <p className="section-label">Current scope</p>
          <h2>Meta Mall</h2>
          <p>Order sessions, billing transactions, charger alarms และ customer behavior</p>
        </article>
      </section>

      <section className="action-row">
        <a className="action-link secondary-button" href="/dashboard">เปิด Executive Dashboard →</a>
        <a className="action-link" href="/imports">เปิดหน้าตรวจสอบและนำเข้าข้อมูล →</a>
      </section>
    </main>
  );
}

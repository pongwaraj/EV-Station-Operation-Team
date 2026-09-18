"use client";

import Link from "next/link";
import Image from "next/image";
import ThemePicker from "./ThemePicker";
import ViewModePicker from "./ViewModePicker";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { group: "ภาพรวม", href: "/dashboard", label: "ภาพรวมสถานี", icon: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" },
  { group: "ประสิทธิภาพและคุณภาพบริการ", href: "/utilization", label: "Utilization & Headroom", icon: "M4 19V5 M4 19h16 M8 16v-5 M12 16V8 M16 16V3 M20 16v-7" },
  { group: "ประสิทธิภาพและคุณภาพบริการ", href: "/abnormal-sessions", label: "ประสบการณ์ลูกค้า", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 11l2 2 4-4" },
  { group: "ประสิทธิภาพและคุณภาพบริการ", href: "/alarms", label: "สัญญาณเตือน", icon: "M12 3 2 21h20L12 3z M12 9v5 M12 17v1" },
  { group: "ลูกค้าและการตลาด", href: "/strategy", label: "กลยุทธ์การเติบโต", icon: "M3 20h18 M5 16l4-5 3 3 6-8 M18 6h3v3" },
  { group: "ลูกค้าและการตลาด", href: "/retention", label: "ลูกค้าประจำ & Retention", icon: "M4 19V5 M4 19h16 M8 15l3-4 3 2 5-7" },
  { group: "ลูกค้าและการตลาด", href: "/customer-value", label: "Customer Value & CRM", icon: "M12 2v20 M17 6.5C16 5.5 14.5 5 12.5 5 10 5 8 6.2 8 8.2c0 2.2 2 3.1 4.8 3.8 2.8.7 4.7 1.6 4.7 3.8 0 2-2 3.2-5 3.2-2.2 0-4-.7-5-2" },
  { group: "ลูกค้าและการตลาด", href: "/partner-overview", label: "ภาพรวมสถานี", icon: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" },
  { group: "ลูกค้าและการตลาด", href: "/partner-insights", label: "พฤติกรรมลูกค้า", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 11h4 M19 9v4" },
  { group: "ลูกค้าและการตลาด", href: "/partner-retention", label: "การกลับมาใช้ซ้ำ", icon: "M20 11a8 8 0 1 1-2.3-5.7 M20 4v7h-7 M4 13v7h7" },
  { group: "สื่อสารกับผู้บริหาร", href: "/snapshot", label: "Snapshot ผู้บริหาร", icon: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5" },
  { group: "จัดการข้อมูล", href: "/imports", label: "นำเข้าข้อมูล", icon: "M12 16V3 M7 8l5-5 5 5 M3 15v6h18v-6" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const [health, setHealth] = useState<"loading" | "ready" | "pending">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ status?: string }>)
      .then((result) => {
        if (active) setHealth(result.status === "ready" ? "ready" : "pending");
      })
      .catch(() => {
        if (active) setHealth("pending");
      });
    return () => { active = false; };
  }, []);

  const viewMode = pathname.startsWith("/partner") ? "partner" : "admin";
  const visibleLinks = viewMode === "partner" ? links.filter((link) => link.href === "/partner-insights" || link.href === "/partner-retention" || link.href === "/partner-overview") : links;

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="brand" href={viewMode === "partner" ? "/partner-overview" : "/dashboard"} aria-label="ไปยังภาพรวมสถานี Meta Mall">
          <Image className="brand-logo" src="/tce-logo.png" alt="TCE" width={64} height={42} priority />
          <span>
            <span className="brand-name">TCE ChargeX</span>
            <span className="brand-subtitle">Meta Mall</span>
          </span>
        </Link>
        <div className="nav-caption">{viewMode === "partner" ? "META MALL INSIGHTS" : "STATION WORKSPACE"}</div>
        <nav className="main-nav" aria-label="เมนูหลัก">
          {visibleLinks.map((link, index) => (
            <span className="nav-entry" key={link.href}>
              {(index === 0 || visibleLinks[index - 1].group !== link.group) && <span className="nav-group-label">{link.group}</span>}
              <Link aria-current={pathname.startsWith(link.href) ? "page" : undefined} className={`nav-link${pathname.startsWith(link.href) ? " active" : ""}`} href={link.href}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={link.icon} /></svg>{link.label}
              </Link>
            </span>
          ))}
        </nav>
        <div className="workspace-station"><span className="section-label">พื้นที่ข้อมูล</span><strong>{viewMode === "partner" ? "Meta Mall Station" : "TCE Operations"}</strong><small>{viewMode === "partner" ? "การใช้งานและแนวโน้มลูกค้า" : "การดำเนินงานสถานี"}</small></div>
        <ViewModePicker />
        <ThemePicker />
        <span className={`system-pill ${health}`}><span className="system-dot" aria-hidden="true" />{health === "ready" ? "ข้อมูลพร้อมใช้งาน" : health === "pending" ? "รอเชื่อมต่อข้อมูล" : "กำลังตรวจสอบ"}</span>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/dashboard", label: "ภาพรวมสถานี", icon: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" },
  { href: "/abnormal-sessions", label: "ประสบการณ์ลูกค้า", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 11l2 2 4-4" },
  { href: "/alarms", label: "สัญญาณเตือน", icon: "M12 3 2 21h20L12 3z M12 9v5 M12 17v1" },
  { href: "/snapshot", label: "รายงานผู้บริหาร", icon: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5" },
  { href: "/imports", label: "นำเข้าข้อมูล", icon: "M12 16V3 M7 8l5-5 5 5 M3 15v6h18v-6" },
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

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="brand" href="/dashboard" aria-label="ไปยังภาพรวมสถานี Meta Mall">
          <Image className="brand-logo" src="/tce-logo.png" alt="TCE" width={64} height={42} priority />
          <span>
            <span className="brand-name">TCE ChargeX</span>
            <span className="brand-subtitle">Meta Mall</span>
          </span>
        </Link>
        <div className="nav-caption">STATION WORKSPACE</div>
        <nav className="main-nav" aria-label="เมนูหลัก">
          {links.map((link) => (
            <Link aria-current={pathname.startsWith(link.href) ? "page" : undefined} className={`nav-link${pathname.startsWith(link.href) ? " active" : ""}`} href={link.href} key={link.href}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={link.icon} /></svg>{link.label}
            </Link>
          ))}
        </nav>
        <div className="workspace-station"><span className="section-label">สถานีที่เลือก</span><strong>Meta Mall</strong><small>ข้อมูลจากรายการที่นำเข้า</small></div>
        <span className={`system-pill ${health}`}><span className="system-dot" aria-hidden="true" />{health === "ready" ? "ข้อมูลพร้อมใช้งาน" : health === "pending" ? "รอเชื่อมต่อข้อมูล" : "กำลังตรวจสอบ"}</span>
      </div>
    </header>
  );
}

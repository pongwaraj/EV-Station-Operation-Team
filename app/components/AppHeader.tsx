"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/dashboard", label: "ภาพรวม" },
  { href: "/abnormal-sessions", label: "ตรวจสอบความผิดปกติ" },
  { href: "/alarms", label: "Alarm" },
  { href: "/imports", label: "นำเข้าข้อมูล" },
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
        <nav className="main-nav" aria-label="เมนูหลัก">
          {links.map((link) => (
            <Link className={`nav-link${pathname.startsWith(link.href) ? " active" : ""}`} href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="station-pill"><span className="station-dot" aria-hidden="true" />สถานี Meta Mall</span>
        <span className={`system-pill ${health}`}><span className="system-dot" aria-hidden="true" />{health === "ready" ? "ข้อมูลพร้อมใช้งาน" : health === "pending" ? "รอเชื่อมต่อข้อมูล" : "กำลังตรวจสอบ"}</span>
      </div>
    </header>
  );
}

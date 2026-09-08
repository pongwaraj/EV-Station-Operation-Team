"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "ภาพรวม" },
  { href: "/imports", label: "นำเข้าข้อมูล" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="brand" href="/dashboard" aria-label="ไปยังภาพรวมสถานี Meta Mall">
          <span className="brand-mark" aria-hidden="true">TCE</span>
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
      </div>
    </header>
  );
}

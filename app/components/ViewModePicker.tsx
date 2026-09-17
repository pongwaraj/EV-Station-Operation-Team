"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type ViewMode = "admin" | "partner";

export default function ViewModePicker() {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>(pathname.startsWith("/partner") ? "partner" : "admin");

  useEffect(() => {
    let saved: ViewMode = pathname.startsWith("/partner") ? "partner" : "admin";
    try {
      const value = localStorage.getItem("tce-view-mode");
      if (value === "admin" || value === "partner") saved = value;
    } catch {}
    if (pathname.startsWith("/partner")) saved = "partner";
    const timer = window.setTimeout(() => setMode(saved), 0);
    try { localStorage.setItem("tce-view-mode", saved); } catch {}
    if (saved === "partner" && !pathname.startsWith("/partner")) router.replace("/partner-insights");
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  function change(nextMode: ViewMode) {
    setMode(nextMode);
    try { localStorage.setItem("tce-view-mode", nextMode); } catch {}
    window.dispatchEvent(new CustomEvent("tce-view-change", { detail: nextMode }));
    router.push(nextMode === "partner" ? "/partner-insights" : "/dashboard");
  }

  return <label className="view-mode-picker">มุมมอง<select aria-label="มุมมองข้อมูล" value={mode} onChange={(event) => change(event.target.value as ViewMode)}><option value="admin">Admin view</option><option value="partner">Partner view</option></select></label>;
}

"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let choice: Theme = "system";
    try { const saved = localStorage.getItem("tce-theme"); if (saved === "light" || saved === "dark") choice = saved; } catch {}
    const apply = () => { document.documentElement.dataset.theme = choice === "system" ? media.matches ? "dark" : "light" : choice; };
    apply();
    const timer = setTimeout(() => setTheme(choice), 0);
    const onChoice = (event: Event) => { choice = (event as CustomEvent<Theme>).detail; apply(); };
    window.addEventListener("tce-theme-change", onChoice);
    media.addEventListener("change", apply);
    return () => { clearTimeout(timer); media.removeEventListener("change", apply); window.removeEventListener("tce-theme-change", onChoice); };
  }, []);
  function select(value: Theme) {
    setTheme(value);
    try { localStorage.setItem("tce-theme", value); } catch {}
    window.dispatchEvent(new CustomEvent("tce-theme-change", { detail: value }));
  }
  return <label className="theme-picker">ธีมแอพ<select aria-label="ธีมแอพ" value={theme} onChange={e => select(e.target.value as Theme)}><option value="system">ตามอุปกรณ์</option><option value="light">สว่าง</option><option value="dark">มืด</option></select></label>;
}

import type { Metadata } from "next";
import AppHeader from "./components/AppHeader";
import "./globals.css";
import "./workspace.css";
import "./theme.css";
import "./refinements.css";

export const metadata: Metadata = {
  title: "Meta Mall | TCE ChargeX",
  description: "ภาพรวมการใช้งานและประสิทธิภาพสถานีชาร์จ Meta Mall",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('tce-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}" }} /></head>
      <body>
        <a className="skip-link" href="#workspace-content">ข้ามไปเนื้อหา</a>
        <AppHeader />
        <div className="app-main" id="workspace-content">{children}</div>
      </body>
    </html>
  );
}

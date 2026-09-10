import type { Metadata } from "next";
import AppHeader from "./components/AppHeader";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Meta Mall | TCE ChargeX",
  description: "ภาพรวมการใช้งานและประสิทธิภาพสถานีชาร์จ Meta Mall",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <a className="skip-link" href="#workspace-content">ข้ามไปเนื้อหา</a>
        <AppHeader />
        <div className="app-main" id="workspace-content">{children}</div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import AppHeader from "./components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meta Mall | TCE ChargeX",
  description: "ภาพรวมการใช้งานและประสิทธิภาพสถานีชาร์จ Meta Mall",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <AppHeader />
        <div className="app-main">{children}</div>
      </body>
    </html>
  );
}

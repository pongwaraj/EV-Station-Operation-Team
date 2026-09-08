import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EV Station Operations Dashboard",
  description: "Meta Mall station operations foundation",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

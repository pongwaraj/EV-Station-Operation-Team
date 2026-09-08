import { sql } from "drizzle-orm";
import { getDb } from "../../../lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { status: "not_configured", message: "ระบบยังไม่ได้เชื่อมต่อแหล่งข้อมูล" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT
        1 AS ok,
        to_regclass('public.data_imports') AS data_imports,
        to_regclass('public.charging_sessions') AS charging_sessions
    `);
    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    const schemaReady = Boolean(row.data_imports && row.charging_sessions);

    return Response.json(
      schemaReady
        ? { status: "ready", message: "ระบบพร้อมใช้งาน" }
        : { status: "schema_missing", message: "ระบบเชื่อมต่อแล้ว แต่ยังเตรียมโครงสร้างข้อมูลไม่ครบ" },
      { status: schemaReady ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json(
      { status: "unavailable", message: "ยังไม่สามารถเชื่อมต่อแหล่งข้อมูลได้" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

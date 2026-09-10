import { eq } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";
import { chargingSessions, sessionBillingBridge } from "../../../../lib/db/schema";

export const runtime = "nodejs";

const ALLOWED_ORDER_NO = "202609090830130000000000000020G1";
const EXPECTED_KWH = 25.25;

export async function POST(request: Request) {
  if (!process.env.MAINTENANCE_TOKEN || request.headers.get("x-maintenance-token") !== process.env.MAINTENANCE_TOKEN) {
    return Response.json({ message: "ไม่อนุญาต" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { orderNo?: string; confirm?: string };
    if (body.orderNo !== ALLOWED_ORDER_NO) {
      return Response.json({ message: "ไม่พบรายการที่อนุญาตให้ตรวจสอบ" }, { status: 400 });
    }

    const db = getDb();
    const matches = await db
      .select({ id: chargingSessions.id, orderNo: chargingSessions.orderNo, startAt: chargingSessions.startAt, chargingAmountKwh: chargingSessions.chargingAmountKwh })
      .from(chargingSessions)
      .where(eq(chargingSessions.orderNo, ALLOWED_ORDER_NO));
    const matchingRecord = matches.find((row) => Number(row.chargingAmountKwh ?? 0) === EXPECTED_KWH);

    if (!matchingRecord) {
      return Response.json({ orderNo: ALLOWED_ORDER_NO, matchedRecords: matches.length, deleted: false, message: "ไม่พบ record ที่ตรงกับเงื่อนไข" });
    }

    if (body.confirm !== "DELETE_EXACT_RECORD") {
      return Response.json({
        orderNo: matchingRecord.orderNo,
        recordId: matchingRecord.id,
        startAt: matchingRecord.startAt,
        chargingAmountKwh: matchingRecord.chargingAmountKwh,
        matchedRecords: matches.length,
        deleted: false,
        message: "ตรวจสอบ record แล้ว ต้องส่ง confirm เพื่อยืนยันการลบ",
      });
    }

    const bridgeRows = await db
      .select({ id: sessionBillingBridge.id })
      .from(sessionBillingBridge)
      .where(eq(sessionBillingBridge.sessionId, matchingRecord.id));
    for (const bridge of bridgeRows) {
      await db.delete(sessionBillingBridge).where(eq(sessionBillingBridge.id, bridge.id));
    }
    await db.delete(chargingSessions).where(eq(chargingSessions.id, matchingRecord.id));

    return Response.json({
      orderNo: matchingRecord.orderNo,
      recordId: matchingRecord.id,
      startAt: matchingRecord.startAt,
      chargingAmountKwh: matchingRecord.chargingAmountKwh,
      deleted: true,
      deletedBillingBridges: bridgeRows.length,
      message: "ลบ record ที่ตรงกับเงื่อนไขแล้ว",
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "ลบ record ไม่สำเร็จ" }, { status: 500 });
  }
}

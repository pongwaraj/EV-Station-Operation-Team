import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../lib/db/client";
import { importRows } from "../../../../lib/db/schema";
import { importSourceTypes, parseUpload, type ImportSourceType } from "../../../../lib/imports/intake";

export const runtime = "nodejs";

function isSourceType(value: FormDataEntryValue | null): value is ImportSourceType {
  return typeof value === "string" && importSourceTypes().includes(value as ImportSourceType);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const sourceType = form.get("sourceType");
    if (!(file instanceof File) || !file.name) {
      return Response.json({ message: "กรุณาเลือกไฟล์ก่อนตรวจสอบ" }, { status: 400 });
    }
    if (!isSourceType(sourceType)) {
      return Response.json({ message: "ไม่พบประเภทข้อมูลที่รองรับ" }, { status: 400 });
    }

    const parsed = await parseUpload(file, sourceType);
    const validRows = parsed.rows.filter((row) => row.sourceRecordKey && !row.invalidReason);
    const invalidRows = parsed.rows.filter((row) => !row.sourceRecordKey || row.invalidReason);
    const duplicateWithinFile = parsed.rows.filter((row) => row.invalidReason === "รายการซ้ำภายในไฟล์เดียวกัน").length;
    let existingKeys = new Set<string>();
    const databaseConfigured = Boolean(process.env.DATABASE_URL);

    if (databaseConfigured && validRows.length) {
      const db = getDb();
      for (let index = 0; index < validRows.length; index += 500) {
        const keys = validRows.slice(index, index + 500).map((row) => row.sourceRecordKey as string);
        const found = await db
          .select({ sourceRecordKey: importRows.sourceRecordKey })
          .from(importRows)
          .where(and(eq(importRows.sourceType, sourceType), inArray(importRows.sourceRecordKey, keys)));
        found.forEach((row) => existingKeys.add(row.sourceRecordKey));
      }
    }

    const timestamps = validRows
      .map((row) => row.eventTimestamp)
      .filter((timestamp): timestamp is Date => Boolean(timestamp))
      .sort((a, b) => a.getTime() - b.getTime());
    return Response.json({
      fileName: file.name,
      fileSha256: parsed.fileSha256,
      sheetName: parsed.sheetName,
      sourceType,
      totalRows: parsed.rows.length,
      invalidRows: invalidRows.length,
      duplicateWithinFile,
      duplicateInDatabase: existingKeys.size,
      readyToImport: Math.max(validRows.length - existingKeys.size, 0),
      databaseConfigured,
      periodStart: timestamps[0]?.toISOString() ?? null,
      periodEnd: timestamps.at(-1)?.toISOString() ?? null,
      sample: parsed.rows.slice(0, 10).map((row) => ({
        rowNumber: row.rowNumber,
        timestamp: row.eventTimestamp?.toISOString() ?? null,
        station: row.stationKey,
        entity: row.entityKey,
        state: row.invalidReason ?? (existingKeys.has(row.sourceRecordKey ?? "") ? "duplicate_in_database" : "ready"),
      })),
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "ตรวจสอบไฟล์ไม่สำเร็จ" }, { status: 500 });
  }
}

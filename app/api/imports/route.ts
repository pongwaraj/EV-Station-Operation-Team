import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../lib/db/client";
import { ensureAssetMasterSchema } from "../../../lib/db/asset-master";
import { dataImports, dataQualityIssues, importRows } from "../../../lib/db/schema";
import { importSourceTypes, parseUpload, type ImportSourceType } from "../../../lib/imports/intake";
import { normaliseImportedRows } from "../../../lib/imports/normalise";

export const runtime = "nodejs";

function isSourceType(value: FormDataEntryValue | null): value is ImportSourceType {
  return typeof value === "string" && importSourceTypes().includes(value as ImportSourceType);
}

export async function POST(request: Request) {
  let importId: string | undefined;
  try {
    if (!process.env.DATABASE_URL) {
      return Response.json({ message: "ยังไม่ได้ตั้งค่า DATABASE_URL จึงยังนำเข้า DB จริงไม่ได้" }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const sourceType = form.get("sourceType");
    if (!(file instanceof File) || !file.name) {
      return Response.json({ message: "กรุณาเลือกไฟล์ก่อนนำเข้า" }, { status: 400 });
    }
    if (!isSourceType(sourceType)) {
      return Response.json({ message: "ไม่พบประเภทข้อมูลที่รองรับ" }, { status: 400 });
    }

    const parsed = await parseUpload(file, sourceType);
    const db = getDb();
    if (sourceType === "station_info" || sourceType === "device_management") {
      await ensureAssetMasterSchema(db);
    }
    const existingFile = await db
      .select({ id: dataImports.id, status: dataImports.status })
      .from(dataImports)
      .where(eq(dataImports.fileSha256, parsed.fileSha256))
      .limit(1);
    if (existingFile[0]) {
      return Response.json({
        status: "duplicate_file",
        message: "ไฟล์นี้เคยนำเข้าแล้ว ระบบจึงไม่สร้างข้อมูลซ้ำ",
        importId: existingFile[0].id,
        importStatus: existingFile[0].status,
      });
    }

    const created = await db
      .insert(dataImports)
      .values({
        sourceType,
        originalFileName: file.name,
        storagePath: `database-intake://${parsed.fileSha256}`,
        fileSha256: parsed.fileSha256,
        rowCount: parsed.rows.length,
        status: "processing",
      })
      .returning({ id: dataImports.id });
    importId = created[0]?.id;
    if (!importId) throw new Error("สร้างรายการ import ไม่สำเร็จ");
    const currentImportId = importId;

    const validRows = parsed.rows.filter((row) => row.sourceRecordKey && !row.invalidReason);
    const invalidRows = parsed.rows.filter((row) => !row.sourceRecordKey || row.invalidReason);
    let existingKeys = new Set<string>();
    for (let index = 0; index < validRows.length; index += 500) {
      const keys = validRows.slice(index, index + 500).map((row) => row.sourceRecordKey as string);
      const found = await db
        .select({ sourceRecordKey: importRows.sourceRecordKey })
        .from(importRows)
        .where(and(eq(importRows.sourceType, sourceType), inArray(importRows.sourceRecordKey, keys)));
      found.forEach((row) => existingKeys.add(row.sourceRecordKey));
    }

    const candidates = validRows.filter((row) => !existingKeys.has(row.sourceRecordKey as string));
    let acceptedRows = 0;
    for (let index = 0; index < candidates.length; index += 500) {
      const chunk = candidates.slice(index, index + 500);
      const inserted = await db
        .insert(importRows)
        .values(
          chunk.map((row) => ({
            importId: currentImportId,
            sourceType,
            sourceRecordKey: row.sourceRecordKey as string,
            contentHash: row.contentHash,
            eventTimestamp: row.eventTimestamp,
            stationKey: row.stationKey,
            entityKey: row.entityKey,
            sourceRowNumber: row.rowNumber,
            sanitizedRow: row.sanitizedRow,
          })),
        )
        .onConflictDoNothing({ target: [importRows.sourceType, importRows.sourceRecordKey] })
        .returning({ id: importRows.id });
      acceptedRows += inserted.length;
    }

    const persistedRows = acceptedRows
      ? await db.select({ sourceRecordKey: importRows.sourceRecordKey }).from(importRows).where(eq(importRows.importId, currentImportId))
      : [];
    const persistedKeys = new Set(persistedRows.map((row) => row.sourceRecordKey));
    const rowsToNormalize = candidates.filter((row) => persistedKeys.has(row.sourceRecordKey as string));
    const normalized = rowsToNormalize.length
      ? await normaliseImportedRows(db, sourceType, rowsToNormalize, currentImportId)
      : { normalizedRows: 0, issues: [] };

    if (invalidRows.length) {
      await db.insert(dataQualityIssues).values(
        invalidRows.map((row) => ({
          importId: currentImportId,
          severity: "warning",
          issueType: row.invalidReason === "รายการซ้ำภายในไฟล์เดียวกัน" ? "duplicate_within_file" : "missing_timestamp",
          sourceRowNumber: row.rowNumber,
          message: row.invalidReason ?? "แถวข้อมูลไม่ผ่านการตรวจสอบ",
        })),
      );
    }

    const duplicateWithinFile = parsed.rows.filter((row) => row.invalidReason === "รายการซ้ำภายในไฟล์เดียวกัน").length;
    const duplicateCount = existingKeys.size + (candidates.length - acceptedRows) + duplicateWithinFile;
    await db
      .update(dataImports)
      .set({
        status: normalized.issues.length ? "completed_with_warnings" : "completed",
        completedAt: new Date(),
        rowCount: parsed.rows.length,
        errorSummary: JSON.stringify({ acceptedRows, normalizedRows: normalized.normalizedRows, normalizationIssues: normalized.issues.length, duplicateCount, invalidRows: invalidRows.length }),
      })
      .where(eq(dataImports.id, currentImportId));

    return Response.json({
      status: "completed",
      importId: currentImportId,
      totalRows: parsed.rows.length,
      acceptedRows,
      normalizedRows: normalized.normalizedRows,
      normalizationIssues: normalized.issues.length,
      duplicateRows: duplicateCount,
      invalidRows: invalidRows.length,
      message: "นำเข้าเฉพาะรายการใหม่แล้ว รายการซ้ำถูกข้ามเรียบร้อย",
    });
  } catch (error) {
    if (importId && process.env.DATABASE_URL) {
      try {
        await getDb().update(dataImports).set({ status: "failed", errorSummary: error instanceof Error ? error.message : "unknown error" }).where(eq(dataImports.id, importId));
      } catch {
        // Preserve the original import error.
      }
    }
    return Response.json({ message: error instanceof Error ? error.message : "นำเข้าไฟล์ไม่สำเร็จ" }, { status: 500 });
  }
}

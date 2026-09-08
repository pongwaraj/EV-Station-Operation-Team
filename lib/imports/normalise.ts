import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  billingTransactions,
  chargerAlarms,
  chargers,
  chargingSessions,
  connectors,
  customerIdentifiers,
  dataQualityIssues,
  stations,
  statusEvents,
} from "../db/schema";
import { firstValue, normaliseValue, parseTimestamp, sha256, type ImportSourceType, type PreparedRow, type RawRow } from "./intake";

type Db = ReturnType<typeof getDb>;

const fields = {
  station: ["station", "station name", "station_name", "站点", "站点名称", "充电站"],
  order: ["order no", "order_no", "order number", "order id", "order_id", "order no.", "订单号"],
  customer: ["v id", "v_id", "vid", "vehicle id", "vehicle_id", "vin", "card number user id", "rfid", "用户id", "客户id"],
  vin: ["vehicle vin", "vin", "vehicle identification number"],
  charger: ["charger", "charger name", "charger serial", "charger sn", "charger number", "serial number", "sn", "设备序列号", "充电桩"],
  connector: ["connector", "connector no", "connector_no", "connector no.", "枪口", "充电枪"],
  start: ["start time", "start_time", "start at", "start_at", "charge start time", "order time", "service date", "date", "time", "timestamp", "alarm start time", "开始时间", "开始充电时间", "日期", "时间"],
  end: ["end time", "end_time", "end at", "end_at", "stop time", "alarm end time", "结束时间", "结束充电时间"],
  beginSoc: ["begin soc", "begin_soc", "soc start", "初始soc"],
  endSoc: ["end soc", "end_soc", "soc end", "结束soc"],
  amount: ["charging amount", "charging amount kwh", "energy", "energy kwh", "kwh", "电量"],
  revenue: ["revenue", "revenue thb", "amount", "total amount", "charging fee", "收入", "金额"],
  duration: ["duration", "duration seconds", "duration_seconds", "持续时间"],
  stopReason: ["stop reason", "stop_reason", "停止原因"],
  reasonCategory: ["reason category", "reason_category", "原因分类"],
  shutdownCode: ["shutdown code", "shutdown_code", "关机码"],
  type: ["type", "session type", "session_type", "类型"],
  alarmCode: ["alarm code", "alarm_code", "code", "告警码", "故障码"],
  alarmReason: ["alarm reason", "alarm_reason", "reason", "告警原因", "故障原因"],
  status: ["status", "alarm status", "state", "状态"],
};

function text(row: RawRow, names: string[]) {
  const value = firstValue(row, names);
  return value === null || value === undefined || String(value).trim() === "" ? null : String(value).trim();
}

function integer(row: RawRow, names: string[]) {
  const value = text(row, names);
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function decimal(row: RawRow, names: string[]) {
  const value = text(row, names);
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed.toFixed(4) : null;
}

function mask(value: string) {
  return value.length <= 4 ? "***" : `${value.slice(0, 2)}***${value.slice(-2)}`;
}

async function ensureStation(db: Db, rawStation: string | null) {
  const sourceName = rawStation || "unknown station";
  const canonicalName = normaliseValue(sourceName);
  const found = await db.select({ id: stations.id }).from(stations).where(eq(stations.canonicalName, canonicalName)).limit(1);
  if (found[0]) return found[0].id;
  const inserted = await db
    .insert(stations)
    .values({ canonicalName, sourceNames: [sourceName] })
    .onConflictDoNothing({ target: stations.canonicalName })
    .returning({ id: stations.id });
  if (inserted[0]) return inserted[0].id;
  const retried = await db.select({ id: stations.id }).from(stations).where(eq(stations.canonicalName, canonicalName)).limit(1);
  if (!retried[0]) throw new Error(`สร้าง station ไม่สำเร็จ: ${sourceName}`);
  return retried[0].id;
}

async function ensureCharger(db: Db, stationId: string, rawCharger: string | null, fallback: string) {
  const serialNumber = normaliseValue(rawCharger || fallback || "unknown charger");
  const found = await db.select({ id: chargers.id }).from(chargers).where(eq(chargers.serialNumber, serialNumber)).limit(1);
  if (found[0]) return found[0].id;
  const inserted = await db
    .insert(chargers)
    .values({ stationId, serialNumber, sourceName: rawCharger, chargerNumber: textFromFallback(rawCharger) })
    .onConflictDoNothing({ target: chargers.serialNumber })
    .returning({ id: chargers.id });
  if (inserted[0]) return inserted[0].id;
  const retried = await db.select({ id: chargers.id }).from(chargers).where(eq(chargers.serialNumber, serialNumber)).limit(1);
  if (!retried[0]) throw new Error(`สร้าง charger ไม่สำเร็จ: ${serialNumber}`);
  return retried[0].id;
}

function textFromFallback(value: string | null) {
  return value && /^\d{6,}$/.test(value) ? value : null;
}

async function ensureConnector(db: Db, chargerId: string, rawConnector: string | null) {
  const connectorNo = integer({ connector: rawConnector }, ["connector"]) ?? 0;
  const found = await db
    .select({ id: connectors.id })
    .from(connectors)
    .where(and(eq(connectors.chargerId, chargerId), eq(connectors.connectorNo, connectorNo)))
    .limit(1);
  if (found[0]) return found[0].id;
  const inserted = await db
    .insert(connectors)
    .values({ chargerId, connectorNo, sourceName: rawConnector })
    .onConflictDoNothing({ target: [connectors.chargerId, connectors.connectorNo] })
    .returning({ id: connectors.id });
  if (inserted[0]) return inserted[0].id;
  const retried = await db
    .select({ id: connectors.id })
    .from(connectors)
    .where(and(eq(connectors.chargerId, chargerId), eq(connectors.connectorNo, connectorNo)))
    .limit(1);
  if (!retried[0]) throw new Error(`สร้าง connector ไม่สำเร็จ: ${connectorNo}`);
  return retried[0].id;
}

async function ensureCustomer(db: Db, row: RawRow) {
  const rawIdentifier = text(row, fields.customer);
  if (!rawIdentifier) return null;
  const identifierHash = sha256(rawIdentifier);
  const found = await db
    .select({ id: customerIdentifiers.id })
    .from(customerIdentifiers)
    .where(and(eq(customerIdentifiers.identifierType, "customer_or_vehicle"), eq(customerIdentifiers.identifierHash, identifierHash)))
    .limit(1);
  if (found[0]) return found[0].id;
  const inserted = await db
    .insert(customerIdentifiers)
    .values({ identifierType: "customer_or_vehicle", identifierHash, displayMask: mask(rawIdentifier) })
    .onConflictDoNothing({ target: [customerIdentifiers.identifierType, customerIdentifiers.identifierHash] })
    .returning({ id: customerIdentifiers.id });
  if (inserted[0]) return inserted[0].id;
  const retried = await db
    .select({ id: customerIdentifiers.id })
    .from(customerIdentifiers)
    .where(and(eq(customerIdentifiers.identifierType, "customer_or_vehicle"), eq(customerIdentifiers.identifierHash, identifierHash)))
    .limit(1);
  return retried[0]?.id ?? null;
}

async function ensureAssets(db: Db, row: PreparedRow) {
  const stationId = await ensureStation(db, text(row.rawRow, fields.station));
  const chargerId = await ensureCharger(db, stationId, text(row.rawRow, fields.charger), row.entityKey ?? "unknown charger");
  const connectorId = await ensureConnector(db, chargerId, text(row.rawRow, fields.connector));
  const customerIdentifierId = await ensureCustomer(db, row.rawRow);
  return { stationId, chargerId, connectorId, customerIdentifierId };
}

export async function normaliseImportedRows(db: Db, sourceType: ImportSourceType, rows: PreparedRow[], importId: string) {
  let normalizedRows = 0;
  const issues: Array<{ sourceRowNumber: number; message: string }> = [];

  for (const row of rows) {
    try {
      if (!row.eventTimestamp || !row.sourceRecordKey) throw new Error("ไม่พบ timestamp หรือ source key");
      const assets = await ensureAssets(db, row);
      const startAt = row.eventTimestamp;
      const endAt = parseTimestamp(firstValue(row.rawRow, fields.end));
      const rawRow = row.sanitizedRow;

      if (sourceType === "charging_sessions") {
        const orderNo = text(row.rawRow, fields.order) || `source:${row.sourceRecordKey}`;
        await db.insert(chargingSessions).values({
          importId,
          orderNo,
          stationId: assets.stationId,
          chargerId: assets.chargerId,
          connectorId: assets.connectorId,
          customerIdentifierId: assets.customerIdentifierId,
          startAt,
          endAt,
          durationSeconds: integer(row.rawRow, fields.duration),
          beginSoc: integer(row.rawRow, fields.beginSoc),
          endSoc: integer(row.rawRow, fields.endSoc),
          chargingAmountKwh: decimal(row.rawRow, fields.amount),
          stopReasonRaw: text(row.rawRow, fields.stopReason),
          reasonCategory: text(row.rawRow, fields.reasonCategory),
          shutdownCode: integer(row.rawRow, fields.shutdownCode),
          sessionType: text(row.rawRow, fields.type),
          vehicleVinHash: text(row.rawRow, fields.vin) ? sha256(text(row.rawRow, fields.vin) as string) : null,
          rawRow,
        }).onConflictDoNothing({ target: chargingSessions.orderNo });
      } else if (sourceType === "billing_transactions") {
        await db.insert(billingTransactions).values({
          importId,
          stationId: assets.stationId,
          chargerId: assets.chargerId,
          connectorId: assets.connectorId,
          customerIdentifierId: assets.customerIdentifierId,
          serviceDate: startAt,
          startAt,
          endAt,
          durationSeconds: integer(row.rawRow, fields.duration),
          chargingAmountKwh: decimal(row.rawRow, fields.amount),
          revenueThb: decimal(row.rawRow, fields.revenue),
          sourceRowNumber: row.rowNumber,
          rawRow,
        });
      } else if (sourceType === "charger_alarms") {
        await db.insert(chargerAlarms).values({
          importId,
          stationId: assets.stationId,
          chargerId: assets.chargerId,
          connectorId: assets.connectorId,
          alarmCode: integer(row.rawRow, fields.alarmCode),
          alarmReasonRaw: text(row.rawRow, fields.alarmReason),
          startAt,
          endAt,
          durationSeconds: endAt ? Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 1000)) : null,
          status: text(row.rawRow, fields.status),
          rawRow,
        });
      } else {
        await db.insert(statusEvents).values({
          importId,
          stationId: assets.stationId,
          chargerId: assets.chargerId,
          connectorId: assets.connectorId,
          observedAt: startAt,
          status: text(row.rawRow, fields.status) || "unknown",
          rawRow,
        });
      }
      normalizedRows += 1;
    } catch (error) {
      issues.push({ sourceRowNumber: row.rowNumber, message: error instanceof Error ? error.message : "normalize failed" });
    }
  }

  if (issues.length) {
    await db.insert(dataQualityIssues).values(issues.map((issue) => ({
      importId,
      severity: "error",
      issueType: "normalization_failed",
      sourceRowNumber: issue.sourceRowNumber,
      message: issue.message,
    })));
  }

  return { normalizedRows, issues };
}

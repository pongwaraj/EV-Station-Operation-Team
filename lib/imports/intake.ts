import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

export type ImportSourceType = "charging_sessions" | "billing_transactions" | "charger_alarms" | "status_events";
export type RawRow = Record<string, unknown>;

export type PreparedRow = {
  rowNumber: number;
  rawRow: RawRow;
  sanitizedRow: RawRow;
  sourceRecordKey: string | null;
  contentHash: string;
  eventTimestamp: Date | null;
  stationKey: string | null;
  entityKey: string | null;
  invalidReason?: string;
};

const aliases = {
  timestamp: [
    "start time",
    "start_time",
    "start at",
    "start_at",
    "charge start time",
    "charging start time",
    "order time",
    "service date",
    "date",
    "time",
    "timestamp",
    "alarm start time",
    "start date",
    "开始时间",
    "开始充电时间",
    "日期",
    "时间",
  ],
  station: ["station", "station name", "station_name", "站点", "站点名称", "充电站"],
  order: ["order no", "order_no", "order number", "order id", "order_id", "订单号"],
  customer: ["v id", "v_id", "vid", "vehicle id", "vehicle_id", "vin", "vehicle vin", "card number user id", "rfid", "用户id", "客户id"],
  charger: ["charger", "charger name", "charger serial", "charger sn", "charger number", "serial number", "sn", "设备序列号", "充电桩"],
  connector: ["connector", "connector no", "connector_no", "枪口", "充电枪"],
  alarmCode: ["alarm code", "alarm_code", "code", "告警码", "故障码"],
  status: ["status", "alarm status", "state", "状态"],
};

function normaliseHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, " ")
    .trim();
}

function normaliseValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(file: File) {
  return sha256(Buffer.from(await file.arrayBuffer()));
}

function firstValue(row: RawRow, names: string[]) {
  const wanted = new Set(names.map(normaliseHeader));
  const found = Object.entries(row).find(([key, value]) => wanted.has(normaliseHeader(key)) && value !== null && value !== "");
  return found?.[1] ?? null;
}

function parseTimestamp(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 100000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + value * 86400000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const isoLocal = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(AM|PM))?$/i);
  if (isoLocal) {
    const [, yearText, month, day, hourText = "0", minute = "0", second = "0", meridiem] = isoLocal;
    let hour = Number(hourText);
    if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;
    const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
    const parsed = new Date(Date.UTC(year, Number(month) - 1, Number(day), hour, Number(minute), Number(second)) - 7 * 3600000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const thaiOrEuropean = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (thaiOrEuropean) {
    const [, day, month, yearText, hour = "0", minute = "0", second = "0"] = thaiOrEuropean;
    const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
    const parsed = new Date(Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - 7 * 3600000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSensitiveKey(key: string) {
  const header = normaliseHeader(key).replace(/ /g, "");
  return ["vid", "vehicleid", "vin", "rfid", "cardno", "cardnumber", "phone", "mobile", "customerid", "userid"].some(
    (token) => header.includes(token),
  );
}

function redactValue(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return raw;
  return `sha256:${sha256(raw).slice(0, 16)}`;
}

function sanitiseRow(row: RawRow): RawRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, isSensitiveKey(key) ? redactValue(value) : value]));
}

export function prepareRows(rows: RawRow[], sourceType: ImportSourceType): PreparedRow[] {
  const seen = new Set<string>();

  return rows.map((rawRow, index) => {
    const timestamp = parseTimestamp(firstValue(rawRow, aliases.timestamp));
    const stationKey = normaliseValue(firstValue(rawRow, aliases.station)) || null;
    const orderKey = normaliseValue(firstValue(rawRow, aliases.order));
    const customerKey = normaliseValue(firstValue(rawRow, aliases.customer));
    const chargerKey = normaliseValue(firstValue(rawRow, aliases.charger));
    const connectorKey = normaliseValue(firstValue(rawRow, aliases.connector));
    const entityKey = orderKey || customerKey || [chargerKey, connectorKey].filter(Boolean).join("/") || null;
    const contentHash = sha256(stableJson(rawRow));
    const timestampKey = timestamp?.toISOString() ?? "missing-timestamp";
    const detailKey = [
      orderKey,
      customerKey,
      chargerKey,
      connectorKey,
      normaliseValue(firstValue(rawRow, aliases.alarmCode)),
      normaliseValue(firstValue(rawRow, aliases.status)),
    ]
      .filter(Boolean)
      .join("|");
    const sourceRecordKey = timestamp ? sha256([sourceType, stationKey ?? "", timestampKey, detailKey || contentHash].join("|")) : null;
    const duplicateInFile = sourceRecordKey ? seen.has(sourceRecordKey) : false;
    if (sourceRecordKey) seen.add(sourceRecordKey);

    return {
      rowNumber: index + 2,
      rawRow,
      sanitizedRow: sanitiseRow(rawRow),
      sourceRecordKey,
      contentHash,
      eventTimestamp: timestamp,
      stationKey,
      entityKey,
      ...(timestamp ? {} : { invalidReason: "ไม่พบ timestamp ที่ใช้ตรวจสอบรายการซ้ำ" }),
      ...(duplicateInFile ? { invalidReason: "รายการซ้ำภายในไฟล์เดียวกัน" } : {}),
    };
  });
}

export async function parseUpload(file: File, sourceType: ImportSourceType) {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("ไม่พบ worksheet ในไฟล์");
  const rows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[firstSheet], { defval: null, raw: false });
  return {
    fileSha256: sha256(Buffer.from(bytes)),
    sheetName: firstSheet,
    rows: prepareRows(rows, sourceType),
  };
}

export function importSourceTypes(): ImportSourceType[] {
  return ["charging_sessions", "billing_transactions", "charger_alarms", "status_events"];
}

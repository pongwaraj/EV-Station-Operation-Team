import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const dataImports = pgTable(
  "data_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: text("source_type").notNull(),
    originalFileName: text("original_file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    fileSha256: text("file_sha256").notNull(),
    rowCount: integer("row_count"),
    status: text("status").notNull().default("uploaded"),
    errorSummary: text("error_summary"),
    uploadedBy: text("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("data_imports_file_sha256_idx").on(table.fileSha256)],
);

export const stations = pgTable(
  "stations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    sourceNames: jsonb("source_names").$type<string[]>().notNull().default([]),
    city: text("city"),
    province: text("province"),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("stations_canonical_name_idx").on(table.canonicalName)],
);

export const chargers = pgTable(
  "chargers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stationId: uuid("station_id").notNull().references(() => stations.id),
    serialNumber: text("serial_number").notNull(),
    sourceName: text("source_name"),
    chargerNumber: text("charger_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("chargers_serial_number_idx").on(table.serialNumber)],
);

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chargerId: uuid("charger_id").notNull().references(() => chargers.id),
    connectorNo: integer("connector_no").notNull(),
    sourceName: text("source_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("connectors_charger_connector_idx").on(table.chargerId, table.connectorNo)],
);

export const customerIdentifiers = pgTable(
  "customer_identifiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifierType: text("identifier_type").notNull(),
    identifierHash: text("identifier_hash").notNull(),
    displayMask: text("display_mask"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("customer_identifiers_type_hash_idx").on(table.identifierType, table.identifierHash)],
);

/**
 * Intake ledger used by both daily and monthly uploads.
 * A source record key is deterministic, so overlapping files are safe to re-upload.
 */
export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id").notNull().references(() => dataImports.id),
    sourceType: text("source_type").notNull(),
    sourceRecordKey: text("source_record_key").notNull(),
    contentHash: text("content_hash").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }),
    stationKey: text("station_key"),
    entityKey: text("entity_key"),
    sourceRowNumber: integer("source_row_number"),
    sanitizedRow: jsonb("sanitized_row"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("import_rows_source_record_key_idx").on(table.sourceType, table.sourceRecordKey),
    uniqueIndex("import_rows_content_hash_idx").on(table.sourceType, table.contentHash),
  ],
);

export const chargingSessions = pgTable(
  "charging_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id").notNull().references(() => dataImports.id),
    orderNo: text("order_no").notNull(),
    stationId: uuid("station_id").notNull().references(() => stations.id),
    chargerId: uuid("charger_id").notNull().references(() => chargers.id),
    connectorId: uuid("connector_id").notNull().references(() => connectors.id),
    customerIdentifierId: uuid("customer_identifier_id").references(() => customerIdentifiers.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    beginSoc: integer("begin_soc"),
    endSoc: integer("end_soc"),
    chargingAmountKwh: numeric("charging_amount_kwh", { precision: 12, scale: 4 }),
    stopReasonRaw: text("stop_reason_raw"),
    reasonCategory: text("reason_category"),
    shutdownCode: integer("shutdown_code"),
    sessionType: text("session_type"),
    vehicleVinHash: text("vehicle_vin_hash"),
    rawRow: jsonb("raw_row"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("charging_sessions_order_no_idx").on(table.orderNo)],
);

export const billingTransactions = pgTable("billing_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id").notNull().references(() => dataImports.id),
  stationId: uuid("station_id").notNull().references(() => stations.id),
  chargerId: uuid("charger_id").references(() => chargers.id),
  connectorId: uuid("connector_id").references(() => connectors.id),
  customerIdentifierId: uuid("customer_identifier_id").references(() => customerIdentifiers.id),
  serviceDate: timestamp("service_date", { withTimezone: true }).notNull(),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  chargingAmountKwh: numeric("charging_amount_kwh", { precision: 12, scale: 4 }),
  revenueThb: numeric("revenue_thb", { precision: 12, scale: 2 }),
  sourceRowNumber: integer("source_row_number"),
  rawRow: jsonb("raw_row"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessionBillingBridge = pgTable("session_billing_bridge", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => chargingSessions.id),
  billingTransactionId: uuid("billing_transaction_id").notNull().references(() => billingTransactions.id),
  matchType: text("match_type").notNull(),
  score: numeric("score", { precision: 8, scale: 4 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chargerAlarms = pgTable("charger_alarms", {
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id").notNull().references(() => dataImports.id),
  stationId: uuid("station_id").notNull().references(() => stations.id),
  chargerId: uuid("charger_id").notNull().references(() => chargers.id),
  connectorId: uuid("connector_id").references(() => connectors.id),
  alarmCode: integer("alarm_code"),
  alarmReasonRaw: text("alarm_reason_raw"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  status: text("status"),
  rawRow: jsonb("raw_row"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const statusEvents = pgTable("status_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id").notNull().references(() => dataImports.id),
  stationId: uuid("station_id").notNull().references(() => stations.id),
  chargerId: uuid("charger_id").notNull().references(() => chargers.id),
  connectorId: uuid("connector_id").references(() => connectors.id),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  rawRow: jsonb("raw_row"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dataQualityIssues = pgTable("data_quality_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id").notNull().references(() => dataImports.id),
  severity: text("severity").notNull(),
  issueType: text("issue_type").notNull(),
  sourceRowNumber: integer("source_row_number"),
  message: text("message").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stationsRelations = relations(stations, ({ many }) => ({
  chargers: many(chargers),
  sessions: many(chargingSessions),
  billingTransactions: many(billingTransactions),
  alarms: many(chargerAlarms),
  statusEvents: many(statusEvents),
}));

export const chargersRelations = relations(chargers, ({ one, many }) => ({
  station: one(stations, { fields: [chargers.stationId], references: [stations.id] }),
  connectors: many(connectors),
  sessions: many(chargingSessions),
  alarms: many(chargerAlarms),
  statusEvents: many(statusEvents),
}));

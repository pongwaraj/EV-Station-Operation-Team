import { sql } from "drizzle-orm";

type Database = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/**
 * The production project keeps DATABASE_URL private in Vercel, so the first
 * master-data import also applies this idempotent schema bootstrap. The same
 * statements are checked into db/migrations for normal migration workflows.
 */
export async function ensureAssetMasterSchema(db: Database) {
  const statements = [
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "country" text`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "address" text`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "longitude" numeric(12,7)`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "latitude" numeric(12,7)`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "customer_name" text`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "ac_charger_count" integer`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "dc_charger_count" integer`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "ac_online_count" integer`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "dc_online_count" integer`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "total_power_kw" numeric(12,4)`,
    sql`ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "online_date" date`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "output_type" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "power_kw" numeric(12,4)`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "charger_model" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "country" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "city" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "mcu_version" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "ccu_version" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "status" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "online_date" date`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "last_heartbeat_raw" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "product_version" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "product_category" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "product_type" text`,
    sql`ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "connector_count" integer`,
  ];
  for (const statement of statements) await db.execute(statement);
}

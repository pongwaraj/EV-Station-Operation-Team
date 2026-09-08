# EV Station Operations Dashboard

Production-ready Meta Mall operations dashboard for executive monitoring and controlled data intake.

## Data boundary

- GitHub stores source code, schema, migrations and tests only.
- Raw Excel/CSV files stay in private object storage.
- Normalized operational data is stored in Neon PostgreSQL.
- Customer identifiers are hashed for analytics and masked in the UI.
- Production secrets must be configured in local/Vercel environment variables, never committed.

## Local setup

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

The `/imports` page accepts `.xlsx`, `.xls`, and `.csv` files for charging sessions, billing exports, charger alarms, and status events. The intake mapping covers the Meta Mall exports, including Thai headers such as `ชื่อสถานีอัดประจุ`, `vcard`, `หน่วยไฟฟ้า (kWh)`, and `รายได้ (บาท)`.

## Daily/monthly upload and duplicate control

Every upload goes through a preflight step before import:

1. The first worksheet is parsed and timestamp fields are normalized.
2. A deterministic source record key is calculated from source type, station, timestamp, and available order/customer/device/event fields.
3. Rows duplicated inside the file or already present in `import_rows` are skipped.
4. The exact same file is rejected by its SHA-256 fingerprint.
5. Rows without a usable timestamp are not imported and are recorded as a data-quality issue.

This makes it safe to upload a daily file and later upload a monthly file containing the same period. The intake layer stores sanitized row payloads; customer identifiers are hashed before they enter the database. The `storagePath` field is ready for the private original-file storage adapter before production rollout.

After accepted rows are written to the intake ledger, the importer also normalizes them into the operational tables: charging sessions, billing transactions, charger alarms, or status events. Station, charger, connector, and hashed customer references are created or reused automatically. Normalization runs in bounded batches so larger monthly files do not process one row at a time. A row that cannot be normalized is retained as an intake record and reported in `data_quality_issues` instead of silently disappearing.

The `/dashboard` page provides KPI and trend data from Neon for sessions, kWh, revenue, unique customers, average duration, short sessions, short-session rate, average energy per session, alarm events, alarm rate, peak hours, completed imports, and unresolved data-quality issues. It includes 7-, 30-, and 90-day date presets. Date filters use the station's Asia/Bangkok timezone and are converted to timestamp ranges for querying.

The `/api/health` endpoint checks whether the production database is configured, reachable, and contains the required operational tables. The header reflects this status without exposing connection details.

## Database

The migrations are in `db/migrations/`. `0000_foundation.sql` creates the operational tables and `0001_import_dedup.sql` creates the timestamp-based intake ledger. Order List and Dashboard CSV can therefore be reconciled without double counting. Set `DATABASE_URL` in Vercel before importing production data.

Do not place production Excel, CSV, V IDs, VINs or database credentials in this repository.

# EV Station Operations Dashboard

Round 1 establishes the application foundation for the Meta Mall operations dashboard.

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

The `/imports` page accepts `.xlsx`, `.xls`, and `.csv` files for charging sessions, billing exports, charger alarms, and status events.

## Daily/monthly upload and duplicate control

Every upload goes through a preflight step before import:

1. The first worksheet is parsed and timestamp fields are normalized.
2. A deterministic source record key is calculated from source type, station, timestamp, and available order/customer/device/event fields.
3. Rows duplicated inside the file or already present in `import_rows` are skipped.
4. The exact same file is rejected by its SHA-256 fingerprint.
5. Rows without a usable timestamp are not imported and are recorded as a data-quality issue.

This makes it safe to upload a daily file and later upload a monthly file containing the same period. The intake layer stores sanitized row payloads; customer identifiers are hashed before they enter the database. The `storagePath` field is ready for the private original-file storage adapter before production rollout.

## Database

The migrations are in `db/migrations/`. `0000_foundation.sql` creates the operational tables and `0001_import_dedup.sql` creates the timestamp-based intake ledger. Order List and Dashboard CSV can therefore be reconciled without double counting.

Do not place production Excel, CSV, V IDs, VINs or database credentials in this repository.

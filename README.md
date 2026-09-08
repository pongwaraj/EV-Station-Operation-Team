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

The first dashboard view is a foundation screen only. Data import and database connectivity are planned for the next round.

## Database

The first migration is in `db/migrations/0000_foundation.sql`. It separates imports, sessions, billing, alarms, status events and data quality issues so Order List and Dashboard CSV can be reconciled without double counting.

Do not place production Excel, CSV, V IDs, VINs or database credentials in this repository.

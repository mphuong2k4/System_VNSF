# Migration guide

Run migrations from an empty PostgreSQL 16 database in filename order. Production is forward-only and app rollback remains schema N-1 compatible. Use expand → nullable backfill → validation → switch → later contract. Never overwrite old geographic fields or auto-merge duplicate CCCD. Real migration requires dry-run, reconciliation, backup and Legal/Privacy approval. Destructive down migrations are not automated.

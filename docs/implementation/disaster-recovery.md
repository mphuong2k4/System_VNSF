# Database backup and restore exercise

PostgreSQL is authoritative. Redis, generated caches and job locks are rebuilt; private object storage needs provider-side versioning and replication tested separately. The provisional operating target is an RPO of 15 minutes and an RTO of four hours, pending SRE and business-owner approval.

Production backup policy must combine encrypted daily full backups with continuous WAL archiving, cross-account or cross-project copies, retention locks, access audit and quarterly restore exercises. Backup credentials must be read-only for backup creation and isolated from application credentials.

The local drill uses a portable logical `pg_dump`, restores into a randomly named `vnsf_restore_drill_*` database with fail-fast SQL handling, compares public-table totals and critical row counts, then drops only that isolated database and deletes the temporary dump:

```powershell
$env:DR_ALLOW_RESTORE = "true"
pnpm test:dr
```

A successful local logical restore does not prove provider snapshot, point-in-time recovery, object-storage recovery, DNS cutover or secret recovery. Staging exercises must record backup identifier, target timestamp, measured RPO/RTO, validation queries, operator, approver and cleanup evidence. Never restore production personal data into developer environments.

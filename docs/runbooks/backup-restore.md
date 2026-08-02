# Backup and restore

Target database PITR RPO ≤4h, daily snapshot retention 35 days and monthly 12 months; object RPO ≤24h. Restore into an isolated environment, validate schema/checksums/count reconciliation, scan objects, rotate restored secrets, run smoke tests, then obtain incident-owner approval before traffic. Drill twice yearly and before go-live; record actual RPO/RTO.

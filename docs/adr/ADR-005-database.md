# ADR-005: PostgreSQL ownership

Accepted. PostgreSQL 16 is authoritative. UUID, UTC `timestamptz`, `numeric(18,2)`, foreign/check/partial/exclusion constraints and optimistic versions are mandatory. Business states use varchar plus CHECK, not PostgreSQL enums. Production migrations follow expand/backfill/switch/contract.

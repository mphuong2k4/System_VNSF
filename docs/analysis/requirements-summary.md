# Requirements summary

## Sources and precedence

Business Specification v5.5 controls scope, policy, workflow, data, acceptance, privacy and UAT. Website Build Guide v1.4 controls implementation. Appendix H and chapter 19 are the newest Code-Ready baseline.

## MVP

Identity/session/MFA; deny-by-default RBAC with temporal school scope and field policy; schools/programs/periods/calendars; student, guardian, duplicate and transfer history; immutable academic submissions and one/two-level review; private scanned documents; encrypted/masked bank data; manual-transfer tracking and append-only correction; extensions; thank-you letters; localized in-app/email notifications; dashboards, scoped reports, asynchronous import/export; append-only audit; observability, backup and staging-ready Docker.

Grade 9 and below defaults to SCHOOL_MANAGED; grade 10 and above to STUDENT_MANAGED. Program overrides are effective-dated. Missing grade fails safe to SCHOOL_MANAGED.

## Out of scope

Bank/payment APIs, payment instructions, automated disbursement or reconciliation, accounting ledger, native mobile, OCR, SSO, SMS/Zalo, AI scholarship decisions, personal-data donor portal, enterprise BI and microservices.

## Canonical controls

- Policy evaluates role x action x scope x state x field; outside sensitive scope is 404.
- CCCD/bank fields use application encryption, key version and separate HMAC; masked by default; reveal requires purpose, re-auth and audit.
- UTC persistence; deadlines displayed/calculated in Asia/Ho_Chi_Minh.
- Idempotency for submit/confirm/transfer/correction/import confirm/export; optimistic locking for sensitive mutation.
- All external side effects originate from a transactional outbox.
- vi-VN is default and en-US is mandatory.

# VNSF final engineering audit

> Release-candidate verification update (2026-08-09): remediation now includes migration 017 access administration, controlled break-glass, encrypted student identity, structured academic validation, locale persistence, a responsive VNSF UI, and private-route/session-expiry enforcement. Current evidence is clean migrations 001-017, API integration 14/14, worker integration 4/4, security 3/3, browser E2E 5/5, workspace build/lint/typecheck/unit gates, dependency audit with no Critical/High advisory, liveness p95 26.97 ms, and an isolated 55-table backup/restore drill. The historical findings below remain point-in-time evidence; retention execution and provider-level production acceptance still prevent a production-ready declaration.

> Post-audit remediation update (2026-08-08): findings A-01, A-02, A-03, A-05 and A-10 were implemented in migration 017 and the administration, break-glass, students, identity, academics and web modules. Clean-database API integration now covers user access revocation, scoped emergency access, encrypted identity disclosure and locale persistence. A-04 remains Critical because retention execution requires approved Legal rules; A-06 through A-09 remain release-readiness work. The original findings below are preserved as point-in-time audit evidence.

Date: 2026-08-08 (Asia/Ho_Chi_Minh)  
Scope: repository, both supplied requirements documents, clean test database, API, worker, web build, Docker test dependencies and CI/release configuration.  
Verdict: **NOT PRODUCTION-READY**. Four Critical and six High requirement/readiness gaps remain. Green builds do not override these gaps.

## Method and runtime evidence

The audit extracted the Word document XML and traced the MVP and non-functional clauses to controllers, services, migrations, UI routes and tests. It did not rely on earlier completion reports. A clean Docker test stack was created with PostgreSQL 16, Redis 7, MinIO, Mailpit and ClamAV. Migrations `001` through `016` applied in order. A native Windows PostgreSQL process was found occupying the former test port `55432`; the test stack and CI were moved to `55433` so tests could not silently hit the wrong database.

Observed results after fixes:

- OpenAPI lint: pass.
- lint: pass.
- typecheck: pass.
- production build: API, worker and web pass; Vite transformed 1,063 modules.
- clean migration: 16/16 pass.
- API integration: 7 files, 11/11 tests pass.
- worker integration: 3 files, 4/4 tests pass, including clean/EICAR object scanning.
- security regression: 1 file, 3/3 tests pass.
- browser E2E: 4/4 pass on the lockfile-matched Chromium build.
- dependency audit at High threshold: pass; 0 Critical and 0 High advisories, with 3 Low and 5 Moderate remaining.
- The liveness baseline was 100 requests with p95 31.53 ms; it is not broad enough for production acceptance (A-07/A-08).

## Coverage of requested audit areas

|     # | Area                                      | Result                                    | Evidence / gap                                                                                                                                                                                               |
| ----: | ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1-3 | Requirements, traceability, MVP modules   | Fail                                      | Core workflows exist, but user administration, break-glass, identity-number lifecycle and retention execution are absent (A-01..A-04).                                                                       |
|     4 | OpenAPI vs implementation                 | Partial                                   | OpenAPI validates and sampled routes match controllers; no generated-client or automated route/schema drift gate (A-06).                                                                                     |
|     5 | Schema and migrations                     | Pass with caveat                          | Clean `001-016` succeeds; migration checksum enforcement exists. Business gaps remain despite placeholder tables.                                                                                            |
|     6 | RBAC, scope, field permissions            | Partial                                   | Deny-by-default policy, server-derived scope, masking and reveal checks exist; missing admin/break-glass lifecycle prevents full matrix compliance.                                                          |
|     7 | State machines                            | Partial                                   | Academic, assistance, transfer, obligation and document transitions are guarded; generic academic payload permits semantically invalid submissions (A-05).                                                   |
|     8 | Idempotency                               | Pass for implemented sensitive flows      | Academic submit, assistance decisions, transfers and data jobs store actor/key/request hash/response.                                                                                                        |
|     9 | Optimistic locking                        | Pass for implemented versioned aggregates | `If-Match`/version predicates and conflict errors are present on relevant update paths.                                                                                                                      |
|    10 | Transactional outbox                      | Pass                                      | State changes and outbox inserts share DB transactions; dispatcher was hardened with terminal evidence.                                                                                                      |
|    11 | Retry and DLQ                             | Pass after fix                            | Exponential retry plus `queue_dead_letters` migration and terminal failure recording added.                                                                                                                  |
|    12 | Encryption and masking                    | Pass for implemented fields               | AES-GCM/HMAC-backed protected fields, masked reads and audited reveal paths exist. Identity-number API itself is missing (A-03).                                                                             |
|    13 | Upload security                           | Pass after fix                            | Private quarantine, declared size, actual byte count, actual SHA-256, MIME sniffing, ClamAV and clean promotion are enforced.                                                                                |
| 14-17 | Logs, secrets, IDOR and web/input attacks | Partial/pass                              | Structured logs avoid bodies; tracked-source pattern scan found no credential; parameterized SQL and generated object keys predominate; CSP/security headers added. Full adversarial DAST is missing (A-08). |
|    18 | Unit/integration/E2E                      | Partial                                   | Current suites pass, but identity/RBAC matrix, break-glass and full browser acceptance cannot be covered while modules are absent.                                                                           |
|    19 | Builds                                    | Pass                                      | API, web and worker production builds pass.                                                                                                                                                                  |
|    20 | Clean Compose                             | Partial                                   | Clean dependency stack and migrations pass; production-like full stack still uses floating third-party tags and lacks immutable artifact verification (A-09).                                                |
|    21 | vi-VN/en-US                               | Partial                                   | Both UI catalogs and notification locale selection exist; user preference mutation/persistence is absent (A-10).                                                                                             |
|    22 | Accessibility                             | Partial                                   | Semantic controls and keyboard E2E checks exist; no complete WCAG 2.1 AA audit (A-08).                                                                                                                       |
|    23 | Performance                               | Fail                                      | Only liveness smoke baseline; no authenticated workflow, export/import or concurrency thresholds (A-07).                                                                                                     |
|    24 | Backup/restore docs                       | Partial                                   | Local logical restore drill and runbook exist; provider PITR/object restore and approved RPO/RTO evidence are pending (A-09).                                                                                |
|    25 | Production readiness                      | Fail                                      | Unresolved Critical/High findings and business/SRE approvals remain.                                                                                                                                         |

## Findings

### A-01 — Missing user, role and scope-assignment administration

- **Severity:** Critical
- **Location:** `apps/api/src/app.module.ts`, `apps/api/src/modules`, `apps/web/src/features`, `packages/contracts/openapi.yaml`; schema only in `infra/docker/postgres/001_baseline.sql` and `004_authorization.sql`.
- **Issue:** No production API/UI/service implements user CRUD, activation/lock/unlock, role assignment, school assignment or immediate access revocation required by the Identity/USR MVP.
- **Impact:** Administrators cannot safely provision or revoke operators. RBAC data can only be manipulated out of band, making access governance and acceptance testing incomplete.
- **Reproduce:** Enumerate Nest controllers or OpenAPI paths and search for `/users`, role assignment, school assignment, lock or unlock operations; none are registered.
- **Fix:** Implement versioned user/role/scope admin APIs and UI, require MFA/reauth for privileged mutations, revoke active sessions transactionally on access changes, emit audit/outbox events and add the documented authorization matrix tests.

### A-02 — Break-glass is schema-only

- **Severity:** Critical
- **Location:** `infra/docker/postgres/003_identity.sql:51`, `apps/api/src/modules/authorization/policy.ts:23`; no controller/service/UI/OpenAPI path.
- **Issue:** A table and permission string exist, but there is no reauthentication + MFA + reason + expiry workflow, elevated session enforcement, termination or special audit trail.
- **Impact:** Emergency access cannot be used through a controlled path; direct database intervention would be unaudited and unsafe.
- **Reproduce:** Search source and OpenAPI for `break_glass`/`breakglass`; only migration and permission declaration are returned.
- **Fix:** Add a short-lived, separately authenticated break-glass API and UI, server-side expiry/scope limits, reason validation, prominent audit/outbox events, notification and explicit termination.

### A-03 — Student national-identity lifecycle is schema-only

- **Severity:** Critical
- **Location:** `infra/docker/postgres/002_mvp.sql:6`; no students service/controller/OpenAPI/UI implementation.
- **Issue:** `student_identity` has encrypted/HMAC columns, but no authorized create/update, duplicate match, masked display or audited reveal operation exists.
- **Impact:** A mandatory student-profile field cannot be managed; operators may store it in an unsafe free-text field or outside the system.
- **Reproduce:** Search for `student_identity` outside migrations; no runtime implementation is found.
- **Fix:** Add encrypted write and HMAC duplicate lookup, field-level masked reads, reauthenticated reveal with reason, audit events and cross-scope tests.

### A-04 — Retention execution is intentionally absent

- **Severity:** Critical
- **Location:** `apps/api/src/modules/governance/governance.service.ts:100-223`, OpenAPI `/retention/*`.
- **Issue:** The system can create policy versions, preview and approve dry runs, but has no legal-hold-aware anonymize/purge executor or immutable execution evidence.
- **Impact:** Regulatory deletion/anonymization cannot be completed, so production retention obligations cannot be met.
- **Reproduce:** Approve a retention dry run; there is no execute endpoint/job and records remain unchanged.
- **Fix:** After Legal approves category rules, implement dual-controlled execution, legal-hold exclusions, bounded batches, outbox notifications, terminal immutable evidence and restore-safe tests. This needs a business/legal decision and was not guessed during audit.

### A-05 — Academic payload lacks domain schema and scale validation

- **Severity:** High
- **Location:** `apps/api/src/modules/academics/academics.service.ts:22-31`.
- **Issue:** Draft data is an arbitrary JSON record capped only by byte size; type-specific transcript/GPA/score scale and required-subject rules are not enforced.
- **Impact:** Semantically invalid submissions can enter review and corrupt scholarship decisions/reporting.
- **Reproduce:** Save `{ "payload": { "gpa": 999, "scale": "unknown" } }`; the generic Zod schema accepts it.
- **Fix:** Define versioned schemas per submission type/academic period, normalize scales, validate required fields and persist schema version with migration/backward compatibility.

### A-06 — OpenAPI drift is not mechanically prevented

- **Severity:** High
- **Location:** `packages/contracts/openapi.yaml`, `apps/web/src/lib/api.ts`, `.github/workflows/ci.yml`.
- **Issue:** The document lints, but controller parity and request/response compatibility are not tested and the web client is hand-written rather than generated/validated.
- **Impact:** A controller or response can change while CI stays green, breaking integrations and UI at runtime.
- **Reproduce:** Add a controller route without editing OpenAPI; current lint/build succeeds.
- **Fix:** Generate typed server/client contracts or add an application bootstrap parity test plus schema-based response tests, and fail CI on drift.

### A-07 — Performance evidence is not representative

- **Severity:** High
- **Location:** `tests/performance/baseline.mjs`, `package.json` performance script.
- **Issue:** The baseline measures only liveness; it does not exercise authenticated lists, scoped dashboards, submission, imports/exports, object handling or concurrency.
- **Impact:** Query, memory and queue bottlenecks may appear only under real load after release.
- **Reproduce:** Inspect the performance script; requests target the liveness endpoint and no business SLO thresholds are asserted.
- **Fix:** Agree NFR targets and add staged k6 scenarios with production-like data, concurrency, DB query monitoring, worker backlog and fail thresholds.

### A-08 — Security and WCAG acceptance breadth is incomplete

- **Severity:** High
- **Location:** `apps/api/test/security`, `apps/web/e2e`, `.github/workflows/ci.yml`.
- **Issue:** Regression and keyboard tests cover a small subset; no complete RBAC/IDOR matrix, authenticated DAST, axe/contrast/screen-reader suite or upload fuzz corpus is enforced.
- **Impact:** Cross-role authorization and accessibility regressions may evade CI.
- **Reproduce:** List security/E2E tests and compare them with all roles, permissions, scopes and WCAG 2.1 AA criteria; many cells have no test.
- **Fix:** Add role×scope×resource integration matrices, OWASP DAST against staging, malicious upload corpus, axe-core per route, manual screen-reader evidence and release gates.

### A-09 — Provider disaster recovery and immutable deployment evidence are pending

- **Severity:** High
- **Location:** `docs/implementation/disaster-recovery.md`, `docker-compose.staging.yml`, `.github/workflows/release.yml`.
- **Issue:** The local logical restore is useful, but provider PITR, object-version restore, cross-account copies, measured approved RPO/RTO and immutable image/signature evidence are not demonstrated.
- **Impact:** Recovery time/data loss and deployed artifact provenance are unknown in a real outage.
- **Reproduce:** Run the local drill and inspect its exclusions; it explicitly does not prove provider snapshot, object restore, DNS or secret recovery.
- **Fix:** Select the production provider, pin images by digest, sign/SBOM artifacts, configure PITR/object versioning, perform a staging restore/cutover exercise and record approvals.

### A-10 — Locale preference cannot be managed end-to-end

- **Severity:** High
- **Location:** `infra/docker/postgres/001_baseline.sql:7`, `apps/web/src/main.tsx:110-115`, identity/user APIs.
- **Issue:** Users can toggle the current UI and notifications read `preferred_locale`, but there is no authenticated API that persists a preference.
- **Impact:** Language resets across devices/sessions and notification language cannot be self-managed reliably.
- **Reproduce:** Toggle language, start a new browser/session, and inspect the user row; no request updates `preferred_locale`.
- **Fix:** Add an authenticated profile preference endpoint with enum validation/audit, hydrate i18n from the user profile and add vi-VN/en-US persistence tests.

## Conclusion

The implemented subset is materially healthier after this audit, but the repository is not a complete MVP and is not production-ready. A release must remain blocked until all Critical findings and the High release gates above are closed or formally re-scoped and accepted by the authorized business, Legal, Security and SRE owners.

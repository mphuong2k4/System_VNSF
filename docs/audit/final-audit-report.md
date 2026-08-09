# VNSF final engineering audit

Audit date: 2026-08-09. Sources inspected directly: Business Specification v5.5 (2,903 paragraphs), Website Build Guide v1.4 (1,420 paragraphs), repository at `0abcc10`, migrations 001-017, OpenAPI, tests and the running Docker stack.

## Decision

**NO-GO for production.** The implemented MVP is suitable for controlled development/UAT, but four High findings remain. The former retention blocker is closed by the owner's binding rule: confirmed user data is retained indefinitely, is never purged/anonymized/deleted, and may only be corrected by `SUPER_ADMIN` through versioned, audited workflows.

## Verification summary

| Area                             | Direct evidence                                                                               | Result                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Requirements/modules             | Both DOCX files, traceability, 97 controller handlers, web routes                             | Core MVP modules implemented               |
| OpenAPI                          | Redocly validation/bundle; 76 documented paths compared with controllers                      | Valid; no obvious endpoint-domain omission |
| Database                         | Empty PostgreSQL test volume, migrations 001-017                                              | Pass                                       |
| RBAC/scope/field permissions     | policy/service inspection; access, banking, governance and reporting integration              | Implemented; exhaustive matrix absent      |
| State/idempotency/locking/outbox | services, constraints/triggers and integration tests                                          | Implemented in critical workflows          |
| Queue/retry/DLQ                  | worker source, migration 016, worker integration                                              | Implemented                                |
| Encryption/masking/upload        | crypto/student/banking/document services; MinIO/ClamAV integration                            | Implemented                                |
| Web threats/logging/secrets      | guard, error/observability code, parameterized SQL/object-key inspection, secret-pattern scan | No direct Critical/High defect found       |
| Unit                             | API 27, worker 7, web 2                                                                       | Pass                                       |
| Integration                      | API 14/14, worker 4/4                                                                         | Pass after AUD-FIX-01                      |
| E2E                              | Playwright Chromium 6/6                                                                       | Pass                                       |
| Build                            | config/contracts/UI/API/web/worker                                                            | Pass                                       |
| Performance                      | 100 liveness requests, concurrency 10                                                         | 0 failures; p95 28.94 ms                   |
| Backup/restore                   | isolated logical restore                                                                      | 55 tables and critical counts matched      |
| Dependencies                     | `pnpm audit --audit-level high`                                                               | 0 Critical/High; 5 Moderate, 3 Low         |

## Coverage of the 25 requested areas

1. Both requirement documents were parsed directly and compared with code.
2. Requirement traceability was refreshed in `requirement-gap-report.md`.
3. Identity, administration, student, academic, document, banking, transfer, assistance, obligation, notification, reporting, governance and configuration modules exist.
4. OpenAPI validates and covers the implemented endpoint domains; automated semantic controller drift detection is absent (AUD-05).
5. A clean database applied migrations 001-017.
6. RBAC, school/student scope, masked identity/bank fields and break-glass exist; exhaustive negative coverage is absent (AUD-02).
7. Submission, expense, transfer, extension and thank-you state transitions are guarded.
8. Actor-bound idempotency records/unique constraints protect submission, transfer and data jobs.
9. Version/If-Match checks protect versioned mutations.
10. Business mutations emit transactional `outbox_events`.
11. Retry/backoff and durable `queue_dead_letters` exist.
12. AES-GCM/HMAC, masking, reauthentication and audited reveal exist.
13. Private quarantine, size/hash/magic-byte checks, ClamAV and clean-only download exist.
14. Logs exclude bodies/query values and redact sensitive keys.
15. Tracked-source key/token scan found no private key or provider token; dependency examples remain test-only.
16. Deny-by-default scope and 404 concealment exist; complete IDOR matrix is missing (AUD-02).
17. Origin/CSRF, React escaping, parameterized SQL, server-generated object keys and no user URL fetch reduce OWASP risk; DAST/fuzz evidence is missing (AUD-02).
18. Unit/integration/E2E results are listed above.
19. Frontend/backend/worker production build passes.
20. Test Compose was recreated from empty volumes; the live demo volume was intentionally preserved.
21. vi-VN/en-US catalogs and persisted locale exist.
22. Landmarks, skip-link and mobile overflow E2E exist; complete WCAG evidence is missing (AUD-03).
23. Liveness baseline passes; representative workflows are unmeasured (AUD-04).
24. Backup/restore runbooks and logical drill exist; provider recovery is unproven (AUD-06).
25. Production readiness is NO-GO while High findings remain.

## Findings

### AUD-01 — Retention execution is not implemented

- **Severity:** Low (closed by business decision)
- **Location:** Governance retention policy and confirmed-data mutation services.
- **Issue:** The earlier audit assumed purge/anonymize was required. The owner has now explicitly required permanent retention and prohibited deletion of confirmed user data.
- **Impact:** No purge executor is required; implementing one would violate the approved business rule.
- **Reproduce:** Review the recorded owner decision and verify there is no runtime physical-delete path for confirmed user records.
- **Fix:** Closed: retain confirmed data indefinitely; allow only `SUPER_ADMIN` correction with mandatory reason, version history and immutable audit evidence. Record regulatory approval before production cutover.

### AUD-02 — Exhaustive authorization and adversarial coverage is absent

- **Severity:** High
- **Location:** `apps/api/test/security`, `apps/api/test/integration`, CI workflow.
- **Issue:** Existing tests cover representative scope controls, not every role × endpoint × state × field, authenticated DAST, fuzz payload or malicious upload corpus.
- **Impact:** An untested IDOR, stored-XSS or boundary regression may pass CI.
- **Reproduce:** Compare 97 handlers with three dedicated security tests and the integration inventory.
- **Fix:** Generate a deny/allow matrix from OpenAPI, add cross-school/student negatives per operation, authenticated ZAP/DAST, schema fuzzing and a malicious-file corpus as release gates.

### AUD-03 — WCAG 2.1 AA acceptance evidence is incomplete

- **Severity:** High
- **Location:** `apps/web/e2e/accessibility-responsive.spec.ts`, all authenticated routes.
- **Issue:** Keyboard landmarks and mobile overflow are tested, but axe coverage, 200% zoom, contrast, screen reader and every route are not evidenced.
- **Impact:** Blocking accessibility defects can remain undiscovered.
- **Reproduce:** Compare the two accessibility-responsive cases with Guide v1.4 section 17.8 and all routes.
- **Fix:** Add axe per route/role, zoom/text-expansion tests and retain manual NVDA/VoiceOver acceptance evidence.

### AUD-04 — Performance evidence does not represent the specified workload

- **Severity:** High
- **Location:** `tests/performance/smoke.mjs`, `tests/performance/smoke.js`.
- **Issue:** The passing Node baseline measures only `/health/live`, not dashboard, list, upload, export/worker or the 20 RPS/100-concurrent requirement.
- **Impact:** Capacity, database contention and queue latency are unknown.
- **Reproduce:** Inspect the smoke target and compare it with v5.5 NFR-PERF and Guide v1.4 section 11.
- **Fix:** Agree thresholds, seed representative volumes, run k6 business scenarios at sustained/burst load and store latency/error/queue evidence in CI artifacts.

### AUD-05 — OpenAPI/controller drift is not semantically enforced

- **Severity:** Medium
- **Location:** `.github/workflows/ci.yml`, `packages/contracts/openapi.yaml`.
- **Issue:** Redocly validates syntax, but CI does not compare Nest routes/request/response behavior to OpenAPI.
- **Impact:** A future route or schema change may silently drift from the contract.
- **Reproduce:** Add a controller route without editing OpenAPI; current contract validation still passes.
- **Fix:** Add generated route/schema conformance or contract tests against a booted API.

### AUD-06 — Provider production recovery and operations are unproven

- **Severity:** High
- **Location:** `docs/runbooks/backup-restore.md`, staging/release configuration.
- **Issue:** Local logical restore passes, but provider PITR, object-version restore, approved RPO/RTO, alert routing and production cutover evidence do not exist in the repository.
- **Impact:** Recovery time/data loss and incident response cannot be assured.
- **Reproduce:** Review restore artifacts: only local PostgreSQL logical restore has measured evidence.
- **Fix:** Select the production provider, configure managed backups/object versioning/alerts, run a timed database+object restore and cutover, and obtain SRE approval.

### AUD-07 — Moderate/Low dependency advisories remain

- **Severity:** Medium
- **Location:** `pnpm-lock.yaml` dependency graph.
- **Issue:** Audit reports five Moderate and three Low advisories.
- **Impact:** No current Critical/High gate failure, but maintenance risk remains.
- **Reproduce:** Run `pnpm audit --audit-level high` and inspect the full advisory list.
- **Fix:** Triage reachability, upgrade when compatible and keep scheduled dependency scanning.

## Remediation performed during this audit

### AUD-FIX-02 — Confirmed user data immutability and privileged correction

- **Severity:** High (fixed)
- **Location:** assistance, transfers and banking services plus their integration tests.
- **Issue:** Program managers or students could initiate replacement/correction after expense confirmation, transfer receipt or bank-account validation.
- **Impact:** Confirmed user evidence could be changed by a role below system administrator.
- **Reproduce:** Attempt expense `CORRECT` as `PROGRAM_MANAGER`, correct a received transfer as `PROGRAM_MANAGER`, or replace a validated bank account as `STUDENT`.
- **Fix:** These operations now return concealed 404 unless the actor is `SUPER_ADMIN`; correction reason is mandatory, old records remain versioned, and bank correction emits an immutable audit event.

### AUD-FIX-01 — Integration test coupled locale behavior to MFA default

- **Severity:** Low
- **Location:** `apps/api/test/integration/access-administration.integration.test.ts`.
- **Issue:** A locale-persistence test asserted `mfa_enabled=false` although integration config defaults to true.
- **Impact:** Clean-environment integration failed for an unrelated configuration value.
- **Reproduce:** Run integration without `MFA_ENABLED=false`; 13/14 API tests pass.
- **Fix:** Removed the unrelated MFA assertion. Rerun: API 14/14 and worker 4/4 pass.

### AUD-FIX-03 — ClamAV INSTREAM client closed before receiving verdict

- **Severity:** High (fixed)
- **Location:** `apps/worker/src/document-scanner.ts`.
- **Issue:** The scanner half-closed TCP immediately after the zero-length INSTREAM frame; current ClamAV could close without delivering a verdict, producing `CLAMAV_UNEXPECTED_RESPONSE`.
- **Impact:** Both clean and infected uploads could fail closed and remain unavailable, blocking document processing.
- **Reproduce:** Run worker integration against the current `clamav/clamav:stable`; both scanner cases initially returned an empty response.
- **Fix:** Keep the socket open after the terminator, accumulate the complete `OK`/`FOUND` response, settle once, then close. Rerun: worker integration 4/4 passes, including clean PDF and EICAR.

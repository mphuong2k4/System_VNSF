# VNSF requirement traceability and gap report

Audit date: 2026-08-09. Sources: Business Specification v5.5 and Website Build Guide v1.4, parsed directly from the supplied DOCX files.

## Traceability

| Requirement domain                    | Implementation evidence                       | Verification                  | Status                        |
| ------------------------------------- | --------------------------------------------- | ----------------------------- | ----------------------------- |
| AUTH/MFA/session/reauth               | identity module; migrations 003/016           | unit, security, E2E           | Implemented                   |
| Four roles/user/school administration | administration module; migration 017          | integration                   | Implemented                   |
| Scope/field/break-glass               | policy, breakglass, student identity          | integration, source review    | Implemented; matrix gap RG-02 |
| Student/guardian/duplicate/history    | students module; migrations 004/006           | unit/integration              | Implemented                   |
| Academic submission/review            | academics/state machine; migration 007        | unit/integration              | Implemented                   |
| Documents/upload/scan                 | documents + scanner; migration 008            | real MinIO/ClamAV integration | Implemented                   |
| Banking/manual transfer               | banking/transfers; migrations 009/010         | unit/integration              | Implemented                   |
| Expense/support                       | assistance; migration 011                     | unit/integration              | Implemented                   |
| Extension/thank-you                   | obligations; migration 012                    | integration                   | Implemented                   |
| Notification/reminder                 | notifications + worker; migration 013         | integration                   | Implemented                   |
| Dashboard/import/export               | reporting + data jobs; migration 014          | integration                   | Implemented; load gap RG-04   |
| Audit/consent/legal hold              | governance; migration 015                     | integration                   | Implemented                   |
| Retention lifecycle                   | permanent-retention owner rule; version/audit | integration/source review     | Implemented                   |
| i18n                                  | vi-VN/en-US catalogs and preference API       | unit/E2E                      | Implemented                   |
| Accessibility                         | semantic navigation, skip link, responsive UI | E2E                           | Partial; RG-03                |
| Queue/DLQ/observability               | worker, metrics, migration 016                | unit/integration              | Implemented                   |
| Backup/release/operations             | runbooks, DR and release workflow             | local drill/build             | Partial; RG-05                |

## Gaps

### RG-01 — Retention execution missing

- **Severity:** Low (closed by business decision)
- **Location:** Governance retention policy and confirmed-data mutation services.
- **Issue:** The previous gap assumed a purge/anonymize outcome; the owner explicitly selected permanent retention with no deletion after confirmation.
- **Impact:** Purge execution is intentionally out of scope and would conflict with the selected policy.
- **Reproduce:** Review the owner decision and confirmed-state correction integration tests.
- **Fix:** Closed by permanent retention and `SUPER_ADMIN`-only, reasoned, version-preserving correction. Preserve formal regulatory approval as release evidence.

### RG-02 — Requirement-level authorization matrix is incomplete

- **Severity:** High
- **Location:** Security/integration tests.
- **Issue:** Not every role, scope, resource, state and protected field has allow/deny/404 coverage.
- **Impact:** The “zero cross-scope access” acceptance criterion is not fully evidenced.
- **Reproduce:** Map 97 handlers to negative authorization cases; many have no dedicated case.
- **Fix:** Generate and enforce a complete matrix from OpenAPI/permission catalog.

### RG-03 — Full WCAG acceptance missing

- **Severity:** High
- **Location:** Web E2E and UAT evidence.
- **Issue:** Automated/manual coverage does not satisfy all Guide 17.8 checks.
- **Impact:** Accessibility Definition of Done is unmet.
- **Reproduce:** Compare existing two accessibility cases with 320px, zoom 200%, text expansion and screen-reader requirements.
- **Fix:** Add axe route coverage plus manual assistive-technology sign-off.

### RG-04 — NFR workload acceptance missing

- **Severity:** High
- **Location:** Performance tests.
- **Issue:** Only liveness is measured; 20 RPS, 100 concurrent and worker workloads are not evidenced.
- **Impact:** NFR-PERF acceptance is unmet.
- **Reproduce:** Inspect `tests/performance/smoke.mjs`.
- **Fix:** Run representative k6 workflows against production-like data and retain results.

### RG-05 — Production DR/operations acceptance missing

- **Severity:** High
- **Location:** Backup/restore and deployment evidence.
- **Issue:** Provider PITR/object restore, alerts and approved RPO/RTO are not demonstrated.
- **Impact:** Operational Definition of Done is unmet.
- **Reproduce:** Compare provider acceptance requirements with the local logical restore artifact.
- **Fix:** Execute and approve a timed provider recovery/cutover exercise.

## Traceability conclusion

The major MVP domains are represented by usable API/UI and tests. The prior Critical gaps for administration, break-glass, national identity and retention are closed in current source. Confirmed user data follows a no-delete/no-anonymize policy and correction is restricted to `SUPER_ADMIN` with reason and preserved history. Authorization, WCAG, workload and provider-recovery acceptance evidence remains High.

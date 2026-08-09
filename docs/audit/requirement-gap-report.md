# VNSF requirement traceability and gap report

Source set: `VNSF_Dac_ta_He_thong_Quan_ly_Hoc_bong_v5.5_Code_Ready.docx` and `VNSF_Tai_lieu_Xay_dung_He_thong_Website_v1.4_Code_Ready.docx`, compared directly with the repository on 2026-08-08.

## Traceability summary

| Requirement domain                             | Runtime implementation                         | Verification                  | Status                                                    |
| ---------------------------------------------- | ---------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Authentication, session, MFA, recovery, reauth | identity module, migrations 003/004            | unit/security/build           | Implemented; privileged admin lifecycle missing (RG-01).  |
| User/role/school assignment and revocation     | baseline schema only                           | source/OpenAPI enumeration    | Missing (RG-01).                                          |
| Break-glass                                    | table + permission only                        | source/OpenAPI enumeration    | Missing (RG-02).                                          |
| Student/guardian/transfer/duplicate            | students module and UI                         | unit/build                    | Implemented; national identity lifecycle missing (RG-03). |
| Academic submission/review/snapshot            | academics module/state machine/UI              | unit/build                    | Partial; type/schema rules missing (RG-04).               |
| Banking/manual transfers                       | banking/transfers modules and UI               | integration                   | Implemented with masking/reveal/idempotency.              |
| Expenses/support/obligations/thank-you         | assistance/obligations modules and UI          | integration/unit/build        | Implemented.                                              |
| Documents                                      | document module + scanner worker               | real MinIO/ClamAV integration | Implemented after integrity fix.                          |
| Notifications/reminders                        | notifications + worker                         | SMTP/DB integration           | Implemented.                                              |
| Import/export/reporting/dashboard              | reporting + data-job worker                    | integration/build             | Implemented; load SLO evidence missing (RG-06).           |
| Audit/config/consent/legal hold                | governance/config modules                      | integration/build             | Partial; retention execution missing (RG-05).             |
| i18n and accessibility                         | vi/en resources, language toggle, keyboard E2E | unit/E2E                      | Partial (RG-07).                                          |
| Operations/backup/release                      | runbooks, DR script, CI/release workflow       | local drill/build             | Partial (RG-06).                                          |

## Requirement gaps

### RG-01 — Administrative identity lifecycle absent

- **Severity:** Critical
- **Location:** Missing from `apps/api/src/modules`, `apps/web/src/features` and `packages/contracts/openapi.yaml`; underlying tables in migrations 001/004.
- **Issue:** Required user CRUD, role/permission and school-scope assignment, lock/unlock and access-change session revocation are not implemented.
- **Impact:** The MVP cannot be securely administered or accepted against the USR requirements.
- **Reproduce:** Enumerate registered controllers/OpenAPI; no user administration paths exist.
- **Fix:** Implement versioned privileged APIs/UI, transactional session revocation, audit/outbox and full authorization-matrix tests.

### RG-02 — Controlled emergency access absent

- **Severity:** Critical
- **Location:** `infra/docker/postgres/003_identity.sql`, `apps/api/src/modules/authorization/policy.ts`; no runtime module.
- **Issue:** Break-glass requirements are represented only by storage and a permission label.
- **Impact:** Emergency operations cannot satisfy reauth, MFA, reason, expiry and enhanced audit requirements.
- **Reproduce:** Search runtime/OpenAPI for break-glass endpoints; none exist.
- **Fix:** Implement the complete time-boxed workflow and security tests described in A-02.

### RG-03 — National identity field workflow absent

- **Severity:** Critical
- **Location:** `infra/docker/postgres/002_mvp.sql`; no students runtime path.
- **Issue:** Required encrypted identity number handling and field-level permission are not exposed by a controlled service.
- **Impact:** Student records are incomplete or operators may use unsafe workarounds.
- **Reproduce:** Search non-migration code for `student_identity`; there are no matches.
- **Fix:** Add encrypted/HMAC writes, duplicate matching, masked/reveal reads, reasoned audit and scope tests.

### RG-04 — Academic business validation incomplete

- **Severity:** High
- **Location:** `apps/api/src/modules/academics/academics.service.ts:22-31`.
- **Issue:** Arbitrary JSON substitutes for specified academic/transcript/GPA field and scale validation.
- **Impact:** Invalid academic data can be approved and reported.
- **Reproduce:** Store out-of-range GPA or unknown scale in draft payload; it passes schema validation.
- **Fix:** Introduce versioned type-specific academic schemas and normalized scale rules.

### RG-05 — Retention stops after approval preview

- **Severity:** Critical
- **Location:** governance service/controller and OpenAPI retention paths.
- **Issue:** No approved execution step performs legal-hold-aware anonymization/purge.
- **Impact:** Mandatory retention outcomes cannot be fulfilled.
- **Reproduce:** Complete a dry-run approval; no executable transition exists.
- **Fix:** Obtain Legal decisions, then implement dual-control execution and immutable evidence.

### RG-06 — Production NFR/DR acceptance evidence incomplete

- **Severity:** High
- **Location:** `tests/performance/baseline.mjs`, `docs/implementation/disaster-recovery.md`, release workflow.
- **Issue:** Only liveness and a local logical restore are evidenced; approved workload SLO and provider recovery exercises are absent.
- **Impact:** Capacity and recoverability are unknown at production scale.
- **Reproduce:** Review baseline and DR exclusions; business workflows/provider restores are not tested.
- **Fix:** Approve NFR/RPO/RTO, execute representative load and provider restore/cutover tests, retain evidence as release artifacts.

### RG-07 — Language and accessibility acceptance incomplete

- **Severity:** High
- **Location:** `apps/web/src/i18n.ts`, `apps/web/src/main.tsx`, `apps/web/e2e`.
- **Issue:** Both catalogs exist, but preference is not persisted and WCAG 2.1 AA coverage is not complete.
- **Impact:** Language behavior is inconsistent and users of assistive technology may encounter undiscovered blockers.
- **Reproduce:** Toggle language across a new session; inspect E2E coverage against all WCAG routes/criteria.
- **Fix:** Persist user locale and add automated axe plus manual assistive-technology acceptance evidence.

## Traceability decision

The requirement set is **not fully traced to passing implementation**. Tables or permission constants are not counted as completed features. The unresolved Critical/High gaps are release blocking.

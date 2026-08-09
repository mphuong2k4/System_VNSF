# VNSF release readiness

> Release-candidate verification update (2026-08-09): the unauthenticated-dashboard defect is closed. Private routes now verify the session before rendering, expired sessions redirect to sign-in/MFA with a validated local return path, and sign-out is available. Clean migrations 001-017, workspace gates, API integration 14/14, worker integration 4/4, security 3/3, browser E2E 5/5, dependency audit at High threshold, Docker production build, a 100-request liveness smoke (0 failures, p95 26.97 ms), and the isolated 55-table restore drill pass. The codebase is a deployable release candidate, but the production decision remains **NO-GO** until RR-02 through RR-04 receive external Legal/Security/SRE evidence and approval.

> Post-audit remediation update (2026-08-08): user/role/school administration, break-glass, encrypted student identity handling, structured GPA validation and locale persistence are now implemented and tested. RR-01 is closed. RR-02, RR-03 and RR-04 remain release blockers, so the production decision remains NO-GO.

Assessment date: 2026-08-08  
Decision: **NO-GO for production**. Development/test deployment is runnable; production release is blocked.

## Verified release signals

- Workspace lint, OpenAPI validation and TypeScript checks pass.
- API, worker and web production builds pass.
- Clean PostgreSQL applies migrations 001-016.
- API integration passes 11/11 and worker integration passes 4/4 against real test dependencies.
- Security regression passes 3/3; dependency audit has no Critical/High advisory.
- Docker Desktop engine and the test services are operational.
- Staging, disaster-recovery and release workflow scaffolding exists.

## Release blockers

### RR-01 — Mandatory MVP modules are incomplete

- **Severity:** Critical
- **Location:** missing user administration, break-glass and student identity runtime modules; see A-01..A-03.
- **Issue:** Critical requirement domains are represented by database tables/permissions but have no usable API/UI.
- **Impact:** The product cannot be safely administered or meet mandatory student-data workflows.
- **Reproduce:** Enumerate controllers, OpenAPI and UI routes; the required operations are absent.
- **Fix:** Implement and acceptance-test all three domains before release candidacy.

### RR-02 — Retention obligations cannot execute

- **Severity:** Critical
- **Location:** governance retention service/OpenAPI.
- **Issue:** Preview and approval exist without anonymize/purge execution.
- **Impact:** Regulatory retention/deletion obligations cannot be fulfilled.
- **Reproduce:** Approve a dry run; no execute operation/job is available.
- **Fix:** Obtain Legal rules, then implement dual-control, legal-hold-aware execution and immutable evidence.

### RR-03 — Acceptance gates are incomplete

- **Severity:** High
- **Location:** performance, security, E2E/accessibility tests and CI.
- **Issue:** No representative load thresholds, complete RBAC/IDOR matrix, authenticated DAST or full WCAG 2.1 AA evidence.
- **Impact:** Security, capacity and accessibility failures may first appear in production.
- **Reproduce:** Compare test inventory with all roles/routes/NFR/WCAG criteria.
- **Fix:** Add the missing suites, agree thresholds and make them required release checks.

### RR-04 — Production infrastructure and recovery are unproven

- **Severity:** High
- **Location:** staging Compose, release workflow and disaster-recovery runbook.
- **Issue:** Provider PITR/object restore, approved RPO/RTO, immutable image digests/signatures and production monitoring/alert routing are not evidenced.
- **Impact:** Deployment provenance, incident detection and outage recovery remain uncertain.
- **Reproduce:** Review the DR document exclusions and deployment manifests; they do not contain provider exercise evidence or digest-pinned production artifacts.
- **Fix:** Provision the selected production platform, configure observability/secrets/backups, sign and pin artifacts, then run and approve a staging cutover/restore exercise.

## Required approvals and external decisions

- Legal: retention categories, periods, anonymize/purge rules and legal-hold release authority.
- Business owner: final MVP acceptance and academic validation rules.
- Security: privileged access/break-glass design and completed adversarial test evidence.
- SRE/operations: production topology, monitoring/on-call routing, RPO/RTO and restore exercise.
- Data owner: national identity field access/reveal policy.

## Exit criteria for GO

1. Zero open Critical or High findings.
2. All mandatory requirements mapped to implemented API/UI and passing acceptance tests.
3. Clean deployment and rollback using immutable signed artifacts.
4. Representative performance, security and WCAG gates pass.
5. Provider database and object-storage restore exercise meets approved RPO/RTO.
6. Legal, business, Security and SRE approvals are recorded.

Until then, VNSF may be used for controlled development/demo testing only and must not process production personal data.

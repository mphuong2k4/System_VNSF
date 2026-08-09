# VNSF release readiness

Assessment date: 2026-08-09<br>
Decision: **NO-GO for production**; controlled development/UAT is runnable.

## Passing release signals

- Clean PostgreSQL migration 001-017: pass.
- Format/lint/typecheck/OpenAPI: pass.
- Unit: API 27, worker 7, web 2 pass.
- Integration: API 14/14 and worker 4/4 pass.
- Browser E2E: 6/6 pass.
- Production build: API, worker and web pass.
- Security regression: 3/3 pass.
- Dependency gate: zero Critical/High; five Moderate and three Low.
- Runtime performance smoke: 100 requests, concurrency 10, zero failures, p95 28.94 ms.
- Isolated restore: 55 tables and critical counts match; temporary restore database removed.
- Docker test dependencies were recreated from empty volumes; live demo data was preserved.

## Release blockers

### RR-01 — Retention execution cannot satisfy approved obligations

- **Severity:** Low (closed by business decision)
- **Location:** Governance retention policy and confirmed-data mutation services.
- **Issue:** The earlier release rule assumed deletion execution, while the owner has selected permanent retention after confirmation.
- **Impact:** Purge/anonymize is intentionally prohibited; confirmed corrections must be tightly controlled.
- **Reproduce:** Verify manager/student correction attempts return concealed 404 and `SUPER_ADMIN` corrections retain history and reason.
- **Fix:** Closed in application code; retain formal regulatory approval as release evidence.

### RR-02 — Security acceptance coverage is incomplete

- **Severity:** High
- **Location:** Security tests and CI.
- **Issue:** Complete RBAC/IDOR matrix, authenticated DAST and fuzz/malicious upload suites are missing.
- **Impact:** Release security risk is not bounded across the full API surface.
- **Reproduce:** Compare 97 handlers with current security tests.
- **Fix:** Add and require the missing suites; obtain Security approval.

### RR-03 — Accessibility acceptance is incomplete

- **Severity:** High
- **Location:** Web E2E/UAT evidence.
- **Issue:** Full route axe, 200% zoom, contrast and assistive-technology evidence is absent.
- **Impact:** WCAG 2.1 AA release criterion is unmet.
- **Reproduce:** Compare current cases with Guide v1.4 section 17.8.
- **Fix:** Complete automated and manual WCAG acceptance.

### RR-04 — Representative performance acceptance is incomplete

- **Severity:** High
- **Location:** Performance suite.
- **Issue:** Passing liveness smoke does not exercise specified business workload or worker queues.
- **Impact:** Production capacity and tail latency remain unknown.
- **Reproduce:** Inspect smoke endpoint and compare with NFR-PERF workload.
- **Fix:** Execute approved k6 scenarios with production-like scale and thresholds.

### RR-05 — Production provider recovery/operations are unproven

- **Severity:** High
- **Location:** Deployment, monitoring and DR evidence.
- **Issue:** No timed provider PITR/object restore, alert/on-call exercise or approved RPO/RTO evidence.
- **Impact:** Outage response and data recovery cannot be assured.
- **Reproduce:** Repository contains a passing local logical restore only.
- **Fix:** Provision selected platform, configure controls and complete an approved restore/cutover drill.

## Required external approvals

- Legal/business owner: record the approved permanent-retention/no-delete rule and its regulatory basis in the release evidence.
- Security: complete adversarial evidence and production control review.
- Accessibility/business owner: WCAG and MVP UAT sign-off.
- SRE: topology, alerts, capacity thresholds, RPO/RTO and recovery evidence.

## GO criteria

1. Zero open Critical/High findings.
2. Permanent-retention/no-delete policy formally approved and recorded.
3. Full authorization/DAST and WCAG acceptance passes.
4. Representative workload passes agreed SLOs.
5. Provider database and object restore meets approved RPO/RTO.
6. Legal, Security, business/accessibility and SRE approvals are recorded.

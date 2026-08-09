# VNSF security review

Review date: 2026-08-08. Verdict: the fixes below remove several directly exploitable implementation weaknesses, but security approval is **blocked** by missing privileged administration/break-glass modules and incomplete adversarial coverage described in the final audit.

## Fixed Critical/High findings

### SEC-01 — Client-declared checksum trusted for uploads (fixed)

- **Severity:** High
- **Location:** `apps/api/src/modules/documents/documents.service.ts`, `object-storage.service.ts`, `apps/worker/src/document-scanner.ts`.
- **Issue:** Completion previously trusted S3 metadata rather than hashing actual bytes; the worker fetched the object before enforcing actual size.
- **Impact:** A replaced or oversized object could bypass integrity intent and consume worker memory before rejection.
- **Reproduce:** Upload bytes whose SHA-256 differs from the declared checksum while preserving client metadata.
- **Fix:** Implemented actual object length and SHA-256 verification before completion and again before scanning; HEAD size is checked before GET. Real MinIO/ClamAV clean and EICAR integration tests pass.

### SEC-02 — MFA verification did not rotate the session (fixed)

- **Severity:** High
- **Location:** `apps/api/src/modules/identity/identity.service.ts`, `identity.controller.ts`.
- **Issue:** The pre-MFA session token survived successful MFA/enrollment/recovery.
- **Impact:** A fixed or stolen pre-auth token could inherit MFA-verified privilege.
- **Reproduce:** Log in to obtain a pre-MFA cookie, verify MFA, then retry the old cookie.
- **Fix:** Implemented transactional revocation with reason `MFA_ROTATED`, issuance of a fresh session/CSRF token and secure cookie replacement for all MFA completion paths.

### SEC-03 — No terminal DLQ evidence (fixed)

- **Severity:** High
- **Location:** `apps/worker/src/main.ts`, `infra/docker/postgres/016_queue_dlq.sql`.
- **Issue:** Terminal queue/outbox failures were not recorded in an operator-visible durable DLQ.
- **Impact:** Business events could exhaust retries without durable investigation/replay evidence.
- **Reproduce:** Force an outbox/worker job to exceed all attempts and inspect the database before migration 016.
- **Fix:** Added exponential outbox retry, terminal `queue_dead_letters` records, sanitized failure codes, attempts and resolution evidence; failed BullMQ jobs are retained.

### SEC-04 — Sensitive endpoints lacked distributed rate limiting (fixed)

- **Severity:** High
- **Location:** `apps/api/src/modules/identity/session.guard.ts`, `identity.service.ts`, migration 016, `main.ts`.
- **Issue:** Login, reset, reauth, transfer confirmation and exports had no application-level distributed limiter.
- **Impact:** Credential attacks and expensive-action abuse were easier and horizontally scaled instances would not coordinate limits.
- **Reproduce:** Repeatedly call a protected endpoint from the same actor/IP; previous code did not reject bursts.
- **Fix:** Added atomic PostgreSQL window counters, route policies, HMAC-pseudonymized actor/IP keys and trusted-proxy configuration. Regression tests pass.

### SEC-05 — Critical/High vulnerable dependencies (fixed)

- **Severity:** Critical
- **Location:** workspace package manifests and `pnpm-lock.yaml`.
- **Issue:** Dependency audit reported 2 Critical and 23 High advisories, including multipart handling, router XSS/DoS and tooling path/TLS issues.
- **Impact:** Known exploitable defects were present in runtime or build/test dependencies.
- **Reproduce:** Run the prior lockfile through `pnpm audit --audit-level high`.
- **Fix:** Upgraded/pinned affected dependencies and safe overrides. Current audit exits 0 at High threshold with 0 Critical/High; 3 Low and 5 Moderate remain for normal maintenance.

### SEC-06 — Static web responses lacked defensive headers (fixed)

- **Severity:** High
- **Location:** `infra/docker/nginx.conf`.
- **Issue:** Helmet protected API responses, but Nginx-served SPA responses lacked CSP, anti-framing, MIME sniffing, referrer and feature restrictions.
- **Impact:** Browser-side injection/clickjacking impact was unnecessarily broad.
- **Reproduce:** Inspect response headers for `/` from the prior web container.
- **Fix:** Added a restrictive CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. HTTPS/HSTS remains an ingress/provider responsibility.

## Unresolved security findings

### SEC-07 — Privileged administration and break-glass controls absent

- **Severity:** Critical
- **Location:** missing runtime modules; schema in migrations 001/003/004.
- **Issue:** Secure user/scope revocation and controlled emergency access are not implemented.
- **Impact:** Access governance is incomplete and emergency intervention would bypass required controls.
- **Reproduce:** Enumerate OpenAPI/controllers for users, assignments and break-glass; no paths exist.
- **Fix:** Implement A-01/A-02 before security approval.

### SEC-08 — Full cross-scope and DAST coverage absent

- **Severity:** High
- **Location:** `apps/api/test/security`, `apps/web/e2e`, CI.
- **Issue:** Parameterized SQL, generated object keys, React escaping, origin/CSRF checks and deny-by-default policy reduce risk, but every role/resource/scope and OWASP vector is not tested end-to-end.
- **Impact:** An IDOR, stored-XSS or boundary regression in an untested route may survive CI.
- **Reproduce:** Compare all controller operations to security cases; only a subset has negative cross-scope/adversarial tests.
- **Fix:** Add full auth matrix, authenticated ZAP/DAST, payload fuzzing and malicious upload corpus as release gates.

## Additional observations

- SQL values are parameterized; inspected dynamic identifiers are selected from fixed server-side definitions.
- Object keys are server-generated, limiting path traversal; no user-controlled outbound URL fetch was found, limiting SSRF exposure.
- HTTP logs record method/route/status/correlation rather than request bodies; the tracked-source credential pattern scan found no committed private key or token.
- Protected fields use encryption/HMAC and masked responses; reveal paths require authorization/reauth/audit where implemented.
- `.env` contains local secrets but is ignored. Production secrets must come from a managed secret store and be rotated before release.

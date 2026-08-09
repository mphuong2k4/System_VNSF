# VNSF security review

Audit date: 2026-08-09. Verdict: **security approval blocked** by SEC-01 and SEC-02. No directly exploitable Critical/High implementation defect was reproduced in the inspected controls.

## Verified controls

- Opaque cookie sessions, CSRF token and Origin checks; session rotation after MFA.
- Deny-by-default role/school/student scope with 404 concealment.
- Break-glass requires privileged role, MFA, recent reauthentication, reason, bounded scope and expiry.
- AES-256-GCM encryption plus separate HMAC indexing; masked bank/identity reads and audited reveal.
- Parameterized SQL values; fixed server-side dynamic identifiers.
- Server-generated object keys; private quarantine, bounded size, SHA-256/magic-byte validation, ClamAV and clean-only signed download.
- Structured logs exclude request bodies/query values; secret-pattern scan found no private key/provider token.
- Transactional outbox, bounded retry/backoff and durable DLQ evidence.
- Confirmed expense, received transfer and validated bank-account corrections are restricted to `SUPER_ADMIN`, require reasons, and preserve version/audit evidence.
- ClamAV INSTREAM waits for a complete verdict before closing; real clean-file and EICAR integration cases pass.
- Security regression 3/3 and dependency gate with zero Critical/High advisories.

## Findings

### SEC-01 — Exhaustive cross-scope/IDOR matrix and DAST are absent

- **Severity:** High
- **Location:** `apps/api/test/security`, `.github/workflows/ci.yml`.
- **Issue:** Representative controls pass, but all 97 handlers are not exercised across four roles, school/student scopes, states and protected fields; authenticated DAST/fuzzing is absent.
- **Impact:** An endpoint-specific IDOR, injection or stored-XSS regression may survive CI.
- **Reproduce:** Compare handler inventory with three dedicated security cases and CI jobs.
- **Fix:** Add generated policy matrix cases, authenticated ZAP, request-schema fuzzing and malicious upload corpus.

### SEC-02 — Production security operations lack external evidence

- **Severity:** High
- **Location:** Deployment/DR/incident runbooks and release artifacts.
- **Issue:** Managed secret rotation, WAF/ingress TLS/HSTS, alert routing, image signature verification and provider recovery have not been demonstrated.
- **Impact:** Secure operation and recovery cannot be approved even if application controls are sound.
- **Reproduce:** Inspect repository artifacts for provider exercise and Security approval; none are present.
- **Fix:** Configure the selected platform, sign/pin artifacts, exercise detection/recovery and record Security/SRE approval.

### SEC-03 — Dependency maintenance debt remains

- **Severity:** Medium
- **Location:** `pnpm-lock.yaml`.
- **Issue:** Five Moderate and three Low advisories remain.
- **Impact:** Reachable moderate issues could become exploitable as usage changes.
- **Reproduce:** Run `pnpm audit`.
- **Fix:** Review reachability and update compatible dependency chains.

### SEC-04 — Semantic API security contract drift is not gated

- **Severity:** Medium
- **Location:** OpenAPI/CI.
- **Issue:** Syntax validation does not prove implemented security requirements match each operation.
- **Impact:** A future route may omit documented auth/error/scope behavior.
- **Reproduce:** Add an undocumented controller handler; Redocly still validates the unchanged file.
- **Fix:** Add booted-API contract/security conformance tests.

## OWASP disposition

| Vector            | Current disposition                                                         |
| ----------------- | --------------------------------------------------------------------------- |
| CSRF              | Origin + CSRF guard implemented; regression test exists                     |
| XSS               | React escaping and CSP present; stored-XSS DAST missing                     |
| SQL injection     | Parameterized values observed; fuzz coverage incomplete                     |
| SSRF              | No user-controlled outbound URL fetch found                                 |
| Path traversal    | Server-generated object keys and private prefixes                           |
| IDOR              | Scope/404 controls implemented; exhaustive matrix missing                   |
| Sensitive logging | Bodies/query values excluded; redaction keys configured                     |
| Secrets           | No tracked provider/private-key pattern found; local `.env` remains ignored |

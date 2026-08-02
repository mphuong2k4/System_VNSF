# Threat model

Assets: minor/student identity, contacts, academic records, encrypted bank data, documents, sessions and audit evidence. Trust boundaries exist at browser/API, API/database, outbox/worker and provider adapters.

Release regressions cover IDOR/cross-scope, workflow bypass, reviewer races, fixation/stale permissions, CSRF/XSS/SQL injection/SSRF/path traversal, MIME spoof/polyglot/zip bomb, CSV formula injection, expired signed URLs and sensitive log leakage. Default mitigations are server policy + scoped query, DTO allowlists, parameterized SQL, state machines/locks, opaque rotated sessions, CSP/CSRF/Origin checks, private quarantine scanning, formula neutralization, redaction and short-lived signed URLs.

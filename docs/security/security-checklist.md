# Security checklist

- [ ] Production secrets are provided by a secret manager and rotated.
- [ ] Secure cookies, CSRF/Origin, CSP/HSTS/nosniff/referrer/CORS controls verified.
- [ ] MFA/lockout/rate limits and session revoke verified.
- [ ] Authorization allow/deny/404 and field serializers tested for every role/scope/state.
- [ ] Upload limits, magic bytes, checksum, quarantine, AV and expiry tested.
- [ ] Encryption/HMAC rotation and reveal audit tested.
- [ ] Export column policy, purpose, formula neutralization and expiry tested.
- [ ] Dependency/SAST/secret/container scans have no unaccepted Critical/High.

# ADR-003: Opaque cookie sessions

Accepted. Use server-side opaque sessions in Secure, HttpOnly, SameSite=Lax cookies, synchronizer CSRF tokens and Origin checks. Rotate after login/MFA; revoke after password, role or scope changes. Administrative roles cannot receive a full session before TOTP.

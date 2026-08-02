# ADR-008: Sensitive-field encryption

Accepted. CCCD and bank fields use authenticated application-level envelope encryption with `key_version`; separate HMAC supports equality matching. List responses are masked. Reveal requires permission, purpose, re-auth and audit; plaintext never enters logs or browser persistence.

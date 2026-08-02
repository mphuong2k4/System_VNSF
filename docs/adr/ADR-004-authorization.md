# ADR-004: Application authorization

Accepted. Deny by default using role × action × temporal scope × resource state × field. Repositories receive already-scoped queries; out-of-scope sensitive resources return 404. Break-glass requires MFA, re-auth, reason, bounded scope/TTL, notification and review.

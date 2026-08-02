# ADR-010: Observability

Accepted. Structured JSON logs, metrics and OpenTelemetry traces carry `correlation_id` across HTTP, outbox, jobs and audit. Secret/sensitive keys are redacted. Liveness is process-only; readiness checks critical dependencies.

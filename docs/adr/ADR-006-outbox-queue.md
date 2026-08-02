# ADR-006: Outbox and BullMQ

Accepted. Business transactions append outbox rows. A dispatcher publishes idempotent BullMQ jobs with bounded exponential retry and DLQ. Redis is delivery infrastructure, never the source of truth.

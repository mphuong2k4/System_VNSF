# Queue and DLQ

Alert on every new DLQ entry and oldest outbox age beyond SLA. Identify by correlation/event/job IDs, fix the dependency or payload handler, verify idempotency, then replay a bounded batch. Never edit authoritative business rows to make a job pass. Reconcile outbox rows and delivery records afterward.

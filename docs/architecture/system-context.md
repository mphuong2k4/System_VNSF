# System context

Users access a React web application. It calls the NestJS REST API using an opaque secure-cookie session and CSRF protection. PostgreSQL is the source of truth. API transactions write outbox events; a separate BullMQ worker performs email, reminders, scans and exports. All objects are private in S3-compatible storage.

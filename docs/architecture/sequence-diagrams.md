# Critical sequences

## Submit

Client supplies `Idempotency-Key` and version. API locks the submission, checks scope/version/effective deadline and Clean documents, inserts an immutable version, changes state, creates the review task, audit and outbox event, then commits. Worker delivers side effects after commit.

## Review

API locks task, validates assignment/scope/reviewer separation/version, records decision and reason, changes state, creates the next task or approved snapshot, writes audit/outbox, and commits. Concurrent reviewer loses with `VERSION_CONFLICT`.

## Transfer correction

API locks original, inserts replacement and correction link, marks original `CORRECTED`, writes audit/outbox, and commits. Original business values never change.

# API conventions

Base path `/api/v1`; JSON UTF-8; UTC ISO-8601. Detail responses use `{data,meta:{correlation_id,etag?}}`; lists add page/size/total. Errors use `{code,message_key,field_errors,correlation_id}` without stack traces. Lists are server-paginated (max 100) with filter/sort allowlists.

`Idempotency-Key` is required for submit, import confirmation, manual transfer/correction and export. `If-Match` is required for student, review, bank, program/period and correction mutations: missing is 428, mismatch 412. CSRF and Origin validation apply to every mutation.

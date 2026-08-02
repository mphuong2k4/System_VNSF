# Error catalog

| Code                         | HTTP | Meaning                                 |
| ---------------------------- | ---: | --------------------------------------- |
| AUTH_MFA_REQUIRED            |  401 | Full session requires MFA               |
| RESOURCE_NOT_FOUND           |  404 | Missing or concealed by scope           |
| PRECONDITION_REQUIRED        |  428 | Missing If-Match/version                |
| VERSION_CONFLICT             |  412 | Stale optimistic version                |
| INVALID_STATE_TRANSITION     |  409 | Workflow transition denied              |
| REVIEWER_SEPARATION_REQUIRED |  409 | Same actor at both levels               |
| STUDENT_CODE_DUPLICATE       |  409 | Global student code collision           |
| REASON_REQUIRED              |  422 | Return/reject/correction reason missing |
| FILE_NOT_CLEAN               |  422 | Document is not Clean                   |
| IDEMPOTENCY_KEY_REQUIRED     |  400 | Required operation key absent           |
| RATE_LIMITED                 |  429 | Actor/IP limit exceeded                 |
| INTERNAL_ERROR               |  500 | Safe generic server failure             |

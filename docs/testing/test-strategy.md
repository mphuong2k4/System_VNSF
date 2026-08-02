# Test strategy

Unit tests cover policy, states, deadline/calendar, masking/crypto, duplicate matching, money and idempotency. Integration uses real PostgreSQL/Redis/MinIO adapters for repository constraints, transaction/outbox and worker retry. Supertest covers contracts/auth/scope/concurrency/rate limits; Testing Library/MSW covers form/query/i18n/upload; Playwright covers critical bilingual journeys. Security regression and k6 baseline run only against authorized test/staging environments.

No test result is inferred from source presence. If runtime is unavailable: “Các test đã được viết nhưng chưa được thực thi trong môi trường thực tế.”

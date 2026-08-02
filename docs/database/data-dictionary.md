# Data dictionary

All IDs are UUID. Mutable business rows have positive integer `version`; timestamps are UTC. Money is `numeric(18,2)` plus ISO currency. `student_code` is globally unique and never reused. CCCD and bank values are ciphertext + `key_version` + separate HMAC. Submission versions, confirmations, corrections and audit are append-only. `effective_due_at` is a snapshot evaluated in Asia/Ho_Chi_Minh. Null financial values mean unknown; zero means declared zero.

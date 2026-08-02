# ADR-007: Private object storage

Accepted. S3-compatible private storage uses random keys, SHA-256, server-side encryption and short signed URLs. Upload goes init → quarantine → complete → asynchronous scan → promote. Authorization is rechecked for download.

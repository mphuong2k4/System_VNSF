# Email failure

Check provider health, credentials, timeout and bounce status without logging recipients/content. In-app remains mandatory. Retry transient failures with backoff; bounce is terminal. If en-US template is missing, fall back to vi-VN once and emit the fallback metric. Requeue only idempotent delivery IDs.

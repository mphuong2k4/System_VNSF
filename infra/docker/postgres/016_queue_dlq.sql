CREATE TABLE queue_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL UNIQUE,
  job_name varchar(120) NOT NULL,
  payload jsonb NOT NULL,
  failure_code varchar(120) NOT NULL,
  attempts integer NOT NULL CHECK(attempts > 0),
  failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_note text,
  CHECK((resolved_at IS NULL) = (resolved_by IS NULL))
);

CREATE INDEX queue_dead_letters_open_idx
  ON queue_dead_letters(failed_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE request_rate_limits (
  scope_key char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK(hits > 0),
  expires_at timestamptz NOT NULL
);

CREATE INDEX request_rate_limits_expiry_idx ON request_rate_limits(expires_at);

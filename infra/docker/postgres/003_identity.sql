CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash char(64) NOT NULL UNIQUE,
  csrf_hash char(64) NOT NULL,
  mfa_verified_at timestamptz,
  reauthenticated_at timestamptz,
  ip_hash char(64),
  user_agent_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason varchar(50),
  CHECK(expires_at > created_at)
);
CREATE INDEX sessions_active_user_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  type varchar(10) NOT NULL CHECK(type IN('TOTP')),
  secret_ciphertext bytea NOT NULL,
  key_version integer NOT NULL,
  verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mfa_active_user_idx ON mfa_factors(user_id,type) WHERE disabled_at IS NULL;

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_id uuid NOT NULL REFERENCES mfa_factors(id),
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE one_time_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  purpose varchar(20) NOT NULL CHECK(purpose IN('ACTIVATION','PASSWORD_RESET')),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at > created_at)
);
CREATE INDEX one_time_tokens_active_idx ON one_time_tokens(token_hash,expires_at) WHERE consumed_at IS NULL;

CREATE TABLE break_glass_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  scope_json jsonb NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK(expires_at > effective_at AND expires_at <= effective_at + interval '2 hours')
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(254) NOT NULL,
  password_hash text NOT NULL, status varchar(30) NOT NULL CHECK (status IN ('PENDING_ACTIVATION','ACTIVE','SUSPENDED')),
  preferred_locale varchar(10) NOT NULL DEFAULT 'vi-VN' CHECK (preferred_locale IN ('vi-VN','en-US')),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0), locked_until timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(30) NOT NULL UNIQUE, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1);
CREATE TABLE school_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), school_id uuid NOT NULL REFERENCES schools(id), effective_from timestamptz NOT NULL, effective_to timestamptz, CHECK (effective_to IS NULL OR effective_to > effective_from), EXCLUDE USING gist (user_id WITH =, school_id WITH =, tstzrange(effective_from,effective_to,'[)') WITH &&));

CREATE TABLE audit_events (id uuid NOT NULL DEFAULT gen_random_uuid(), occurred_at timestamptz NOT NULL DEFAULT now(), actor_id uuid, action text NOT NULL, resource_type text NOT NULL, resource_id uuid, result text NOT NULL, before_redacted jsonb, after_redacted jsonb, correlation_id uuid NOT NULL, PRIMARY KEY(id,occurred_at)) PARTITION BY RANGE (occurred_at);
CREATE TABLE audit_events_default PARTITION OF audit_events DEFAULT;
CREATE TABLE outbox_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, available_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, attempts integer NOT NULL DEFAULT 0);
CREATE INDEX outbox_pending_idx ON outbox_events(available_at) WHERE processed_at IS NULL;
CREATE TABLE idempotency_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, operation text NOT NULL, key text NOT NULL, request_hash char(64) NOT NULL, response_status integer, response_body_ref text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,operation,key));

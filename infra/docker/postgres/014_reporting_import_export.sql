CREATE TABLE data_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(20) NOT NULL CHECK(kind IN('EXPORT','IMPORT')),
  resource_type varchar(30) NOT NULL CHECK(resource_type IN('STUDENTS','SUBMISSIONS','TRANSFERS')),
  requested_by uuid NOT NULL REFERENCES users(id),
  school_scope_ids uuid[] NOT NULL DEFAULT '{}',
  parameters jsonb NOT NULL DEFAULT '{}',
  source_rows jsonb,
  status varchar(20) NOT NULL CHECK(status IN('QUEUED','PROCESSING','VALIDATED','COMPLETED','FAILED','CANCELLED')),
  result_object_key text,
  result_summary jsonb,
  error_code varchar(80),
  idempotency_key varchar(120) NOT NULL,
  request_hash char(64) NOT NULL,
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((kind='IMPORT' AND source_rows IS NOT NULL) OR (kind='EXPORT' AND source_rows IS NULL)),
  CHECK((status='FAILED' AND error_code IS NOT NULL) OR status<>'FAILED'),
  UNIQUE(requested_by,kind,idempotency_key)
);

CREATE INDEX data_jobs_owner_idx ON data_jobs(requested_by,created_at DESC);
CREATE INDEX data_jobs_dispatch_idx ON data_jobs(status,created_at) WHERE status IN('QUEUED','PROCESSING');

CREATE FUNCTION reject_completed_data_job_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'terminal data jobs are immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER data_jobs_terminal_immutable
BEFORE UPDATE OR DELETE ON data_jobs
FOR EACH ROW EXECUTE FUNCTION reject_completed_data_job_mutation();

CREATE INDEX audit_events_occurred_idx ON audit_events(occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_id,occurred_at DESC);
CREATE INDEX audit_events_resource_idx ON audit_events(resource_type,resource_id,occurred_at DESC);
CREATE INDEX audit_events_action_result_idx ON audit_events(action,result,occurred_at DESC);

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

ALTER TABLE retention_policies
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE legal_holds
  ADD COLUMN released_by uuid REFERENCES users(id),
  ADD COLUMN release_reason text,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT legal_hold_release_check CHECK(
    (released_at IS NULL AND released_by IS NULL AND release_reason IS NULL) OR
    (released_at IS NOT NULL AND released_by IS NOT NULL AND length(release_reason)>=10)
  );
CREATE INDEX legal_holds_active_idx ON legal_holds(subject_type,subject_ref) WHERE released_at IS NULL;

ALTER TABLE consent_policies
  ADD COLUMN content text NOT NULL DEFAULT '[legacy policy content unavailable]',
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD CONSTRAINT consent_content_check CHECK(length(content)>=20);

ALTER TABLE consent_acceptances
  ADD COLUMN withdrawal_reason text,
  ADD CONSTRAINT consent_withdrawal_check CHECK(withdrawn_at IS NULL OR length(withdrawal_reason)>=5);
CREATE UNIQUE INDEX consent_active_acceptance_idx
  ON consent_acceptances(policy_id,student_id) WHERE withdrawn_at IS NULL;

CREATE TABLE retention_dry_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES retention_policies(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  cutoff_at timestamptz NOT NULL,
  candidate_count bigint NOT NULL CHECK(candidate_count>=0),
  held_count bigint NOT NULL CHECK(held_count>=0),
  sample_ids jsonb NOT NULL DEFAULT '[]',
  status varchar(20) NOT NULL CHECK(status IN('DRAFT','APPROVED','CANCELLED')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(approval_reason)>=10) OR status<>'APPROVED')
);
CREATE INDEX retention_dry_runs_created_idx ON retention_dry_runs(created_at DESC);

CREATE FUNCTION reject_governance_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.status IN ('APPROVED','CANCELLED') THEN
    RAISE EXCEPTION 'terminal retention evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retention_dry_runs_terminal_immutable
BEFORE UPDATE OR DELETE ON retention_dry_runs
FOR EACH ROW EXECUTE FUNCTION reject_governance_evidence_mutation();

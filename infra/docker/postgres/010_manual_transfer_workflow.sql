ALTER TABLE manual_transfers
  ADD COLUMN school_id uuid REFERENCES schools(id),
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD COLUMN confirmation_due_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE manual_transfers t SET school_id=s.current_school_id
FROM students s WHERE s.id=t.student_id AND t.school_id IS NULL;
ALTER TABLE manual_transfers ALTER COLUMN school_id SET NOT NULL;

ALTER TABLE transfer_confirmations ADD COLUMN confirmed_by uuid REFERENCES users(id);
CREATE UNIQUE INDEX transfer_confirmation_once_idx ON transfer_confirmations(transfer_id);
CREATE INDEX manual_transfer_scope_idx ON manual_transfers(school_id,status,transferred_at DESC);
CREATE INDEX manual_transfer_student_idx ON manual_transfers(student_id,transferred_at DESC);

CREATE OR REPLACE FUNCTION reject_transfer_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transfer evidence is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER transfer_confirmations_append_only BEFORE UPDATE OR DELETE ON transfer_confirmations FOR EACH ROW EXECUTE FUNCTION reject_transfer_evidence_mutation();
CREATE TRIGGER transfer_corrections_append_only BEFORE UPDATE OR DELETE ON transfer_corrections FOR EACH ROW EXECUTE FUNCTION reject_transfer_evidence_mutation();

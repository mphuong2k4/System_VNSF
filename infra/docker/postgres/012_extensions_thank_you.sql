ALTER TABLE academic_submissions
  ADD COLUMN effective_due_at timestamptz;

UPDATE academic_submissions s
SET effective_due_at = p.due_at
FROM academic_periods p
WHERE p.id = s.period_id AND s.effective_due_at IS NULL;

ALTER TABLE academic_submissions
  ALTER COLUMN effective_due_at SET NOT NULL;

ALTER TABLE extension_requests
  ADD CONSTRAINT extension_obligation_fk
    FOREIGN KEY (obligation_id) REFERENCES academic_submissions(id),
  ADD COLUMN original_due_at timestamptz,
  ADD COLUMN decision_reason text,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD CONSTRAINT extension_due_order CHECK (proposed_due_at > original_due_at),
  ADD CONSTRAINT extension_decision_consistency CHECK (
    (status = 'REQUESTED' AND decided_by IS NULL AND decided_at IS NULL) OR
    (status IN ('APPROVED','REJECTED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL) OR
    status = 'CANCELLED'
  );

UPDATE extension_requests e
SET original_due_at = s.effective_due_at
FROM academic_submissions s
WHERE s.id = e.obligation_id AND e.original_due_at IS NULL;

ALTER TABLE extension_requests ALTER COLUMN original_due_at SET NOT NULL;
CREATE INDEX extension_scope_queue_idx ON extension_requests(status, created_at, obligation_id);

CREATE TABLE thank_you_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  period_id uuid NOT NULL REFERENCES academic_periods(id),
  status varchar(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SCHOOL_REVIEW','PROGRAM_REVIEW','RETURNED','REJECTED','APPROVED','LOCKED')),
  draft_content text NOT NULL DEFAULT '',
  current_version_no integer NOT NULL DEFAULT 0 CHECK (current_version_no >= 0),
  created_by uuid NOT NULL REFERENCES users(id),
  submitted_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, period_id)
);

CREATE TABLE thank_you_letter_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id uuid NOT NULL REFERENCES thank_you_letters(id),
  version_no integer NOT NULL CHECK (version_no > 0),
  content text NOT NULL,
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(letter_id, version_no)
);

CREATE TABLE thank_you_review_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id uuid NOT NULL REFERENCES thank_you_letters(id),
  level smallint NOT NULL CHECK (level IN (1,2)),
  status varchar(20) NOT NULL CHECK (status IN ('OPEN','APPROVED','RETURNED','REJECTED','CANCELLED')),
  reviewer_id uuid REFERENCES users(id),
  reason_code varchar(50),
  note text,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX thank_you_open_review_idx
  ON thank_you_review_tasks(letter_id, level) WHERE status = 'OPEN';
CREATE INDEX thank_you_scope_queue_idx ON thank_you_letters(status, period_id, student_id);

CREATE FUNCTION reject_thank_you_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'thank_you_letter_versions is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER thank_you_versions_no_update
BEFORE UPDATE OR DELETE ON thank_you_letter_versions
FOR EACH ROW EXECUTE FUNCTION reject_thank_you_version_mutation();

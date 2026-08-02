ALTER TABLE academic_submissions
  ADD COLUMN draft_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD COLUMN submitted_by uuid REFERENCES users(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE review_tasks ADD COLUMN completed_at timestamptz;
CREATE INDEX academic_submissions_queue_idx ON academic_submissions(status,period_id,student_id);
CREATE INDEX review_tasks_queue_idx ON review_tasks(status,level,due_at);

CREATE FUNCTION reject_submission_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'submission_versions is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER submission_versions_no_update
BEFORE UPDATE OR DELETE ON submission_versions
FOR EACH ROW EXECUTE FUNCTION reject_submission_version_mutation();

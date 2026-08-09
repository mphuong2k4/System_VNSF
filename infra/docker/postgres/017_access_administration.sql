INSERT INTO roles(code) VALUES
  ('SUPER_ADMIN'),
  ('PROGRAM_MANAGER'),
  ('SCHOOL_MANAGER'),
  ('STUDENT')
ON CONFLICT(code) DO NOTHING;

CREATE INDEX user_roles_active_user_idx
  ON user_roles(user_id, effective_from, effective_to);

CREATE INDEX school_assignments_active_user_lookup_idx
  ON school_assignments(user_id, effective_from, effective_to);

CREATE INDEX break_glass_sessions_active_idx
  ON break_glass_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE break_glass_sessions
  ADD COLUMN ended_by uuid REFERENCES users(id),
  ADD COLUMN ended_reason varchar(500);

ALTER TABLE student_identity
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by uuid REFERENCES users(id),
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);

CREATE TABLE user_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  student_id uuid NOT NULL REFERENCES students(id),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  EXCLUDE USING gist (user_id WITH =, tstzrange(effective_from,effective_to,'[)') WITH &&),
  EXCLUDE USING gist (student_id WITH =, tstzrange(effective_from,effective_to,'[)') WITH &&)
);
CREATE INDEX user_student_links_active_user_idx ON user_student_links(user_id) WHERE effective_to IS NULL;

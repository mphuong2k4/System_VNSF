CREATE TABLE guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(150) NOT NULL,
  contact_ciphertext bytea NOT NULL,
  contact_hmac char(64) NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guardians_contact_hmac_idx ON guardians(contact_hmac);

CREATE TABLE student_guardians (
  student_id uuid NOT NULL REFERENCES students(id),
  guardian_id uuid NOT NULL REFERENCES guardians(id),
  relationship varchar(30) NOT NULL CHECK(relationship IN('MOTHER','FATHER','GUARDIAN','OTHER')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(student_id,guardian_id)
);
CREATE UNIQUE INDEX student_guardian_primary_idx ON student_guardians(student_id) WHERE is_primary;

CREATE TABLE student_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  version_no integer NOT NULL,
  snapshot_json jsonb NOT NULL,
  change_reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id,version_no)
);
CREATE FUNCTION reject_student_profile_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'student_profile_versions is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER student_profile_versions_no_update
BEFORE UPDATE OR DELETE ON student_profile_versions
FOR EACH ROW EXECUTE FUNCTION reject_student_profile_version_mutation();

ALTER TABLE student_school_history ADD COLUMN change_reason text NOT NULL DEFAULT 'INITIAL_ENROLLMENT';
ALTER TABLE student_school_history ADD COLUMN changed_by uuid REFERENCES users(id);
CREATE INDEX students_duplicate_lookup_idx
  ON students(date_of_birth, lower(regexp_replace(trim(full_name),'\s+',' ','g')));

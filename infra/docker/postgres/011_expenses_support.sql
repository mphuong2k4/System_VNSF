CREATE TABLE education_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  school_id uuid NOT NULL REFERENCES schools(id),
  academic_year varchar(9) NOT NULL CHECK(academic_year ~ '^20[0-9]{2}-20[0-9]{2}$' AND substring(academic_year,6,4)::integer=substring(academic_year,1,4)::integer+1),
  vnd_per_term numeric(18,2) CHECK(vnd_per_term IS NULL OR vnd_per_term>=0),
  vnd_per_year numeric(18,2) CHECK(vnd_per_year IS NULL OR vnd_per_year>=0),
  usd_amount numeric(18,2) CHECK(usd_amount IS NULL OR usd_amount>=0),
  liability numeric(18,2) CHECK(liability IS NULL OR liability>=0),
  tutoring_money numeric(18,2) CHECK(tutoring_money IS NULL OR tutoring_money>=0),
  notes text,
  status varchar(15) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SUBMITTED','RETURNED','CONFIRMED')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id,academic_year)
);
CREATE INDEX education_expense_scope_idx ON education_expenses(school_id,academic_year,status);

CREATE TABLE education_expense_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES education_expenses(id),
  version_no integer NOT NULL,
  action varchar(20) NOT NULL CHECK(action IN('CREATED','UPDATED','SUBMITTED','RETURNED','CONFIRMED','CORRECTED')),
  snapshot_json jsonb NOT NULL,
  reason text,
  changed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(expense_id,version_no)
);

CREATE TABLE support_program_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name_vi text NOT NULL,
  name_en text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO support_program_catalog(code,name_vi,name_en) VALUES
  ('TAP','Chương trình TAP','TAP'),
  ('DESK','Hỗ trợ bàn học','Study Desk'),
  ('READING_ROOM','Phòng đọc','Reading Room');

CREATE TABLE student_support_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  school_id uuid NOT NULL REFERENCES schools(id),
  program_code varchar(30) NOT NULL REFERENCES support_program_catalog(code),
  received boolean NOT NULL DEFAULT false,
  received_date date,
  support_value numeric(18,2) CHECK(support_value IS NULL OR support_value>=0),
  currency char(3) NOT NULL DEFAULT 'VND' CHECK(currency IN('VND','USD')),
  status varchar(15) NOT NULL CHECK(status IN('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
  notes text,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((received AND received_date IS NOT NULL) OR (NOT received AND received_date IS NULL)),
  UNIQUE(student_id,program_code,received_date)
);
CREATE INDEX student_support_scope_idx ON student_support_programs(school_id,student_id,active);

CREATE TABLE student_support_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_id uuid NOT NULL REFERENCES student_support_programs(id),
  version_no integer NOT NULL,
  action varchar(15) NOT NULL CHECK(action IN('CREATED','UPDATED','ARCHIVED')),
  snapshot_json jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(support_id,version_no)
);

CREATE OR REPLACE FUNCTION reject_append_only_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'version history is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER education_expense_versions_append_only BEFORE UPDATE OR DELETE ON education_expense_versions FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER support_program_versions_append_only BEFORE UPDATE OR DELETE ON student_support_program_versions FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

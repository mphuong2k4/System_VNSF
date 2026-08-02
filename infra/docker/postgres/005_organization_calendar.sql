ALTER TABLE schools ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE programs ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE academic_periods
  ADD COLUMN opens_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT academic_periods_window_check CHECK (opens_at IS NULL OR due_at > opens_at);

CREATE TABLE calendar_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_date date NOT NULL UNIQUE,
  day_type varchar(20) NOT NULL CHECK(day_type IN('HOLIDAY','WORKING_DAY')),
  name varchar(150) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_days_date_type_idx ON calendar_days(calendar_date,day_type);

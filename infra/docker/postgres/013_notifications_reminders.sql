ALTER TABLE notification_deliveries
  ADD COLUMN last_error_code varchar(80),
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT notification_delivery_status_check
    CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED'));

ALTER TABLE notifications ADD COLUMN dedupe_key varchar(180);
CREATE UNIQUE INDEX notification_dedupe_idx ON notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX notification_delivery_channel_idx
  ON notification_deliveries(notification_id, channel);
CREATE INDEX notification_delivery_retry_idx
  ON notification_deliveries(next_attempt_at)
  WHERE status IN ('PENDING','FAILED');

CREATE TABLE reminder_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_type varchar(40) NOT NULL CHECK (obligation_type IN ('ACADEMIC_SUBMISSION')),
  obligation_id uuid NOT NULL REFERENCES academic_submissions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  school_id uuid NOT NULL REFERENCES schools(id),
  milestone_days smallint NOT NULL CHECK (milestone_days IN (-14,-7,-2,1,7)),
  due_at_snapshot timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED','ENQUEUED','SENT','CANCELLED')),
  notification_id uuid REFERENCES notifications(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(obligation_type, obligation_id, user_id, milestone_days, due_at_snapshot)
);

CREATE INDEX reminder_due_idx ON reminder_schedules(scheduled_for)
  WHERE status = 'SCHEDULED';
CREATE INDEX reminder_obligation_idx ON reminder_schedules(obligation_id, status);

CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(60) NOT NULL,
  locale varchar(10) NOT NULL CHECK (locale IN ('vi-VN','en-US')),
  subject_template text NOT NULL,
  body_template text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(type, locale, version)
);

INSERT INTO notification_templates(type,locale,subject_template,body_template) VALUES
('academic.reminder','vi-VN','Nhắc hạn hồ sơ học bổng','Hồ sơ {{resource_code}} có hạn vào {{due_at}}. Mốc nhắc: {{milestone}} ngày.'),
('academic.reminder','en-US','Scholarship submission reminder','Submission {{resource_code}} is due at {{due_at}}. Reminder milestone: {{milestone}} days.'),
('submission.status_changed','vi-VN','Cập nhật trạng thái hồ sơ','Hồ sơ của bạn đã chuyển sang trạng thái {{status}}.'),
('submission.status_changed','en-US','Submission status updated','Your submission is now {{status}}.'),
('extension.status_changed','vi-VN','Cập nhật đề nghị gia hạn','Đề nghị gia hạn đã chuyển sang trạng thái {{status}}.'),
('extension.status_changed','en-US','Extension request updated','Your extension request is now {{status}}.'),
('thank_you.status_changed','vi-VN','Cập nhật thư cảm ơn','Thư cảm ơn đã chuyển sang trạng thái {{status}}.'),
('thank_you.status_changed','en-US','Thank-you letter updated','Your thank-you letter is now {{status}}.'),
('transfer.status_changed','vi-VN','Cập nhật chuyển khoản','Khoản chuyển đã chuyển sang trạng thái {{status}}.'),
('transfer.status_changed','en-US','Transfer status updated','Your transfer is now {{status}}.'),
('expense.status_changed','vi-VN','Cập nhật chi phí học tập','Bản chi phí học tập đã chuyển sang trạng thái {{status}}.'),
('expense.status_changed','en-US','Education expense updated','Your education expense record is now {{status}}.'),
('identity.password_reset','vi-VN','Đặt lại mật khẩu VNSF','Mở liên kết sau để đặt lại mật khẩu (hết hạn sau 30 phút): {{reset_url}}'),
('identity.password_reset','en-US','Reset your VNSF password','Open this link to reset your password (expires in 30 minutes): {{reset_url}}');

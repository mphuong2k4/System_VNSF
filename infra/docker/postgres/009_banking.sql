ALTER TABLE student_bank_accounts
  ADD COLUMN rejection_reason text,
  ADD COLUMN verified_by uuid REFERENCES users(id),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX bank_account_hmac_idx
  ON student_bank_accounts(bank_code, account_hmac);
CREATE INDEX bank_account_review_queue_idx
  ON student_bank_accounts(status, effective_from)
  WHERE effective_to IS NULL;

ALTER TABLE student_bank_accounts ADD CONSTRAINT bank_review_state_check CHECK (
  (status = 'PENDING_REVIEW' AND verified_by IS NULL AND verified_at IS NULL AND rejection_reason IS NULL)
  OR (status = 'VALIDATED' AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND rejection_reason IS NULL)
  OR (status = 'REJECTED' AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND rejection_reason IS NOT NULL)
);

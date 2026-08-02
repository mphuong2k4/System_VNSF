ALTER TABLE documents
  ADD COLUMN original_filename varchar(255) NOT NULL DEFAULT 'document',
  ADD COLUMN storage_status varchar(15) NOT NULL DEFAULT 'QUARANTINED' CHECK(storage_status IN('QUARANTINED','PROMOTED','DELETED')),
  ADD COLUMN promoted_key text,
  ADD COLUMN uploaded_by uuid REFERENCES users(id),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN scanned_at timestamptz,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
CREATE INDEX documents_scan_queue_idx ON documents(scan_status,storage_status,created_at);

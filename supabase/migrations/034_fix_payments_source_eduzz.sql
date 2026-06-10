ALTER TABLE payments DROP CONSTRAINT payments_source_check;
ALTER TABLE payments ADD CONSTRAINT payments_source_check
  CHECK (source IN ('manual','scheduled','asaas','eduzz'));

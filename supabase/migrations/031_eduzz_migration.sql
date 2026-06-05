-- Add Eduzz transaction ID to payments table
alter table public.payments
  add column if not exists eduzz_transaction_id text unique;

-- Add 'eduzz' as valid source for payments (schedule function uses 'scheduled' and 'manual')
-- No enum change needed; source is text

-- Update payment source column comment for documentation
comment on column public.payments.eduzz_transaction_id is 'Eduzz transaction ID (trans_id from webhook)';

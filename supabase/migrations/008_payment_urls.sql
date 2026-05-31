alter table public.payments
  add column if not exists invoice_url  text,
  add column if not exists bank_slip_url text,
  add column if not exists pix_qr_code  text,
  add column if not exists pix_payload  text;

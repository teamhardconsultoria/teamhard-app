alter table public.diet_logs
  add column if not exists finalized_at timestamptz;

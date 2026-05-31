-- ================================================================
-- TEAM HARD — Cron Jobs (pg_cron + pg_net + Vault)
-- ================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ================================================================
-- CONFIGURAÇÃO INICIAL (rodar UMA VEZ no SQL Editor do Supabase):
--
--   select vault.create_secret('https://SEU_PROJETO.supabase.co', 'supabase_url');
--   select vault.create_secret('SEU_SERVICE_ROLE_KEY',             'service_role_key');
--
-- O service_role_key está em: Dashboard → Settings → API → service_role
-- ================================================================

-- Remove jobs antigos para evitar duplicatas em re-runs
do $$
begin
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in (
    'reminders-plan-expiry',
    'reminders-photos',
    'reminders-questionnaires'
  );
exception when others then null;
end $$;

-- ----------------------------------------------------------------
-- 1. Vencimento de plano — todo dia às 8h BRT (11h UTC)
-- ----------------------------------------------------------------
select cron.schedule(
  'reminders-plan-expiry',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"plan_expiry"}'::jsonb
  )
  $$
);

-- ----------------------------------------------------------------
-- 2. Fotos de avaliação — todo domingo às 9h BRT (12h UTC)
-- ----------------------------------------------------------------
select cron.schedule(
  'reminders-photos',
  '0 12 * * 0',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"photos"}'::jsonb
  )
  $$
);

-- ----------------------------------------------------------------
-- 3. Questionários pendentes — todo dia às 9h BRT (12h UTC)
-- ----------------------------------------------------------------
select cron.schedule(
  'reminders-questionnaires',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"questionnaires"}'::jsonb
  )
  $$
);

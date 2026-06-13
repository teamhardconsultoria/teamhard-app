-- TEAM HARD — Crons: check-in semanal, alerta vermelho e envio de pendentes

do $$
begin
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in (
    'checkin-weekly',
    'red-alert-check',
    'send-pending-messages'
  );
exception when others then null;
end $$;

-- ----------------------------------------------------------------
-- 1. Check-in semanal — toda segunda-feira às 8h BRT (11h UTC)
-- ----------------------------------------------------------------
select cron.schedule(
  'checkin-weekly',
  '0 11 * * 1',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"weekly_checkin"}'::jsonb
  )
  $$
);

-- ----------------------------------------------------------------
-- 2. Verificação alunos vermelhos — todo dia às 9h BRT (12h UTC)
-- ----------------------------------------------------------------
select cron.schedule(
  'red-alert-check',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"red_alert"}'::jsonb
  )
  $$
);

-- ----------------------------------------------------------------
-- 3. Envio de mensagens agendadas — de hora em hora
-- ----------------------------------------------------------------
select cron.schedule(
  'send-pending-messages',
  '0 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"send_pending"}'::jsonb
  )
  $$
);

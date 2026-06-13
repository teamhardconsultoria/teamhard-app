-- Remove job antigo para evitar duplicatas em re-runs
do $$
begin
  perform cron.unschedule(jobname)
  from cron.job
  where jobname = 'reminders-assessment-day';
exception when others then null;
end $$;

-- Avaliação agendada — todo dia às 8h BRT (11h UTC)
select cron.schedule(
  'reminders-assessment-day',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"assessment_day"}'::jsonb
  )
  $$
);

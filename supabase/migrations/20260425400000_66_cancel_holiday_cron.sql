-- 66_cancel_holiday_cron
-- Agenda cancelamento automático de aulas em feriados às 8h Brasília (11:00 UTC)

select cron.schedule(
  'cancel-holiday-sessions-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://wxiwldjgxkjqdjlxgmgj.supabase.co/functions/v1/cancel-holiday-sessions',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1
      )
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);

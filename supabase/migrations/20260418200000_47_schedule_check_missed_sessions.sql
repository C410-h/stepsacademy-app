select cron.schedule(
  'check-missed-sessions-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://wxiwldjgxkjqdjlxgmgj.supabase.co/functions/v1/check-missed-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 62_class_session_notifications
-- Tracks which reminder notifications have been sent per session
-- to prevent duplicate sends across cron runs.

create table public.class_session_notifications (
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  type       text not null check (type in ('30min', '10min', 'start')),
  sent_at    timestamptz default now(),
  primary key (session_id, type)
);

-- Schedule reminder job every 5 minutes
select cron.schedule(
  'notify-class-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://wxiwldjgxkjqdjlxgmgj.supabase.co/functions/v1/notify-class-reminders',
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

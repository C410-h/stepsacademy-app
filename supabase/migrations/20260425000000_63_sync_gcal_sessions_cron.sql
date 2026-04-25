-- 63_sync_gcal_sessions_cron
-- Replaces the single-column unique constraint on google_event_id with a
-- compound (google_event_id, student_id) constraint so group classes can
-- have one class_session row per student for the same GCal event.
-- Also schedules the background sync job.

-- ─────────────────────────────────────────────────────────────
-- 1. Replace unique constraint
-- ─────────────────────────────────────────────────────────────

alter table public.class_sessions
  drop constraint if exists class_sessions_google_event_id_unique;

-- Remove any accidental duplicates on (google_event_id, student_id) before
-- adding the new constraint (keep the row with the latest created_at).
delete from public.class_sessions a
using public.class_sessions b
where a.google_event_id = b.google_event_id
  and a.student_id      = b.student_id
  and a.created_at      < b.created_at
  and a.google_event_id is not null;

alter table public.class_sessions
  add constraint class_sessions_gcal_student_unique
  unique (google_event_id, student_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Schedule hourly background sync (offset from check-missed at :00)
-- ─────────────────────────────────────────────────────────────

select cron.schedule(
  'sync-gcal-sessions-hourly',
  '30 * * * *',
  $$
  select net.http_post(
    url     := 'https://wxiwldjgxkjqdjlxgmgj.supabase.co/functions/v1/sync-gcal-sessions',
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

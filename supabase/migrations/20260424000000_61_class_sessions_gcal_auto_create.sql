-- 61_class_sessions_gcal_auto_create
-- Adds unique constraint on google_event_id so we can upsert (ignore duplicates)
-- when auto-creating sessions from Google Calendar events.
-- Also adds an INSERT policy so students can create their own sessions.

alter table public.class_sessions
  add constraint class_sessions_google_event_id_unique unique (google_event_id);

-- Students may insert sessions for themselves (auto-created from GCal events)
create policy "student_insert_own_sessions" on public.class_sessions
  for insert with check (
    exists (
      select 1 from public.students s
      where s.id = class_sessions.student_id
        and s.user_id = auth.uid()
    )
  );

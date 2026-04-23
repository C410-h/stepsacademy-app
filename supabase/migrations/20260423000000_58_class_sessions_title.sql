-- Custom display title for a class session (overrides student_name in the UI)
ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS title text;

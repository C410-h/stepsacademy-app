-- Attach a step to each class session so we know what was (or will be) taught
ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS step_id uuid REFERENCES public.steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS class_sessions_step_id_idx
  ON public.class_sessions(step_id);

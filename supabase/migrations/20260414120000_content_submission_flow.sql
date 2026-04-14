-- ─── Content Submission Flow ──────────────────────────────────────────────────
-- Tables: content_submissions, submission_files, material_versions, exercise_bank
-- View:   step_completion_status

-- ── content_submissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  step_id         uuid NOT NULL REFERENCES public.steps(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending','approved','rejected','partial')),
  admin_comment   text,
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, step_id)
);

ALTER TABLE public.content_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own submissions"
  ON public.content_submissions
  FOR ALL
  USING (
    teacher_id IN (
      SELECT id FROM public.teachers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins full access on submissions"
  ON public.content_submissions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── submission_files ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submission_files (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         uuid NOT NULL REFERENCES public.content_submissions(id) ON DELETE CASCADE,
  material_type         text NOT NULL
                          CHECK (material_type IN ('slide','audio','grammar','vocab','exercise')),
  file_url              text,
  filename              text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected')),
  comment               text,
  exercises             jsonb,
  ai_conversion_status  text DEFAULT 'idle'
                          CHECK (ai_conversion_status IN ('idle','converting','done','error')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers access own submission files"
  ON public.submission_files
  FOR ALL
  USING (
    submission_id IN (
      SELECT id FROM public.content_submissions
      WHERE teacher_id IN (
        SELECT id FROM public.teachers WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins full access on submission files"
  ON public.submission_files
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── material_versions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  file_url    text,
  filename    text,
  replaced_at timestamptz NOT NULL DEFAULT now(),
  replaced_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.material_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage material versions"
  ON public.material_versions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── exercise_bank ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exercise_bank (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_id  uuid REFERENCES public.languages(id),
  level_id     uuid REFERENCES public.levels(id),
  created_by   uuid REFERENCES public.teachers(id),
  approved_by  uuid REFERENCES auth.users(id),
  type         text NOT NULL CHECK (type IN ('fill_blank','association','open_answer')),
  question     text NOT NULL,
  options      text[],
  answer       text NOT NULL,
  explanation  text,
  tags         text[],
  times_used   integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view exercise bank"
  ON public.exercise_bank
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins manage exercise bank"
  ON public.exercise_bank
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── step_completion_status (view) ────────────────────────────────────────────
-- steps.id is the join key; materials and lesson_exercises reference step_id
CREATE OR REPLACE VIEW public.step_completion_status AS
SELECT
  s.id AS step_id,
  COALESCE(bool_or(m.type = 'slide' AND m.active = true), false) AS has_slide,
  COALESCE(bool_or(le.id IS NOT NULL), false) AS has_exercises,
  (
    COALESCE(bool_or(m.type = 'slide' AND m.active = true), false) AND
    COALESCE(bool_or(le.id IS NOT NULL), false)
  ) AS is_complete
FROM public.steps s
LEFT JOIN public.materials m ON m.step_id = s.id
LEFT JOIN public.lesson_exercises le ON le.step_id = s.id AND le.active = true
GROUP BY s.id;

-- ── Updated_at triggers ───────────────────────────────────────────────────────
CREATE TRIGGER set_updated_at_content_submissions
  BEFORE UPDATE ON public.content_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_submission_files
  BEFORE UPDATE ON public.submission_files
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

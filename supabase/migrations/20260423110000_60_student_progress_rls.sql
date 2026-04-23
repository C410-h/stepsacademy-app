-- RLS policies for student_progress table
-- Admin can do everything; students can read their own records only
-- (writes are done via Edge Functions with service role or admin client)

ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin gerencia student_progress"
  ON public.student_progress FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Students read their own progress
CREATE POLICY "aluno lê próprio progresso"
  ON public.student_progress FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- Students can upsert their own progress (for exercise completion etc.)
CREATE POLICY "aluno atualiza próprio progresso"
  ON public.student_progress FOR INSERT
  WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

CREATE POLICY "aluno modifica próprio progresso"
  ON public.student_progress FOR UPDATE
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

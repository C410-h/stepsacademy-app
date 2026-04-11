
-- RLS for students
CREATE POLICY "admin gerencia alunos" ON public.students FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "aluno vê próprio registro" ON public.students FOR SELECT USING (
  user_id = auth.uid()
);

CREATE POLICY "aluno atualiza próprio registro" ON public.students FOR UPDATE USING (
  user_id = auth.uid()
);

-- RLS for teachers
CREATE POLICY "admin gerencia professores" ON public.teachers FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "professor vê próprio registro" ON public.teachers FOR SELECT USING (
  user_id = auth.uid()
);

-- RLS for teacher_languages
CREATE POLICY "admin gerencia teacher_languages" ON public.teacher_languages FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "autenticado lê teacher_languages" ON public.teacher_languages FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- RLS for classes
CREATE POLICY "admin gerencia aulas" ON public.classes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "aluno vê próprias aulas" ON public.classes FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  OR group_id IN (
    SELECT gs.group_id FROM group_students gs
    JOIN students s ON s.id = gs.student_id
    WHERE s.user_id = auth.uid()
  )
);

CREATE POLICY "professor vê próprias aulas" ON public.classes FOR SELECT USING (
  teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
);

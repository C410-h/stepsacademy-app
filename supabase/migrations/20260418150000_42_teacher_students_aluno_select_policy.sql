-- Permite que o aluno leia o próprio vínculo professor-aluno
-- Necessário para o componente UpcomingClasses resolver o professor do aluno
CREATE POLICY "aluno vê seu professor"
  ON teacher_students FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

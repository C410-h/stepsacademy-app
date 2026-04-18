-- Permite que o aluno leia o registro do seu professor na tabela teachers
-- Necessário para UpcomingClasses resolver o user_id (profiles.id) do professor
-- Usa get_student_id_by_user (SECURITY DEFINER) para evitar recursão de RLS
CREATE POLICY "aluno vê seu professor em teachers"
  ON teachers FOR SELECT
  USING (
    id IN (
      SELECT teacher_id
      FROM teacher_students
      WHERE student_id = get_student_id_by_user(auth.uid())
    )
  );

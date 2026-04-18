-- Remove a policy recursiva que criou o ciclo
DROP POLICY IF EXISTS "aluno vê seu professor" ON teacher_students;

-- Função SECURITY DEFINER: lê students sem acionar RLS,
-- quebrando a dependência circular students ↔ teacher_students
CREATE OR REPLACE FUNCTION get_student_id_by_user(uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM students WHERE user_id = uid LIMIT 1;
$$;

-- Recria a policy usando a função, sem recursão
CREATE POLICY "aluno vê seu professor"
  ON teacher_students FOR SELECT
  USING (
    student_id = get_student_id_by_user(auth.uid())
  );

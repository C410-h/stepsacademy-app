-- Função SECURITY DEFINER: retorna user_id e nome do professor vinculado ao aluno.
-- Bypassa RLS em todas as tabelas, eliminando qualquer risco de recursão.
-- Usado pelo componente UpcomingClasses via supabase.rpc('get_my_teacher_info')
CREATE OR REPLACE FUNCTION get_my_teacher_info(p_uid uuid)
RETURNS TABLE(teacher_user_id uuid, teacher_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.user_id, p.name
  FROM teachers t
  JOIN teacher_students ts ON ts.teacher_id = t.id
  JOIN students s ON s.id = ts.student_id
  JOIN profiles p ON p.id = t.user_id
  WHERE s.user_id = p_uid
  LIMIT 1;
$$;

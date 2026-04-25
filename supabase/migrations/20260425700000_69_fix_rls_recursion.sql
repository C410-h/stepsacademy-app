-- Migration 69: Fix RLS infinite recursion + link test students to teacher
-- Drops the circular policy from migration 68 and properly links duo/group
-- test students to espanhol01 via teacher_students (the correct data model).

-- Drop circular policy that caused infinite recursion
-- (students → class_sessions → students via session_attendees subquery)
DROP POLICY IF EXISTS "professor vê alunos via session_attendees" ON students;

-- Link test accounts to espanhol01 teacher so RLS allows the teacher to see them
-- teacher_id (teachers.id) for espanhol01: 3082db30-0075-4619-ad4a-296922cd87d9
INSERT INTO teacher_students (teacher_id, student_id)
VALUES
  ('3082db30-0075-4619-ad4a-296922cd87d9', '3f959a2f-28bd-442d-b472-fef934c02dc8'),  -- Caio Aluno
  ('3082db30-0075-4619-ad4a-296922cd87d9', 'ea539d40-0e8a-4f78-98de-cf56293891c0'),  -- Claude Test
  ('3082db30-0075-4619-ad4a-296922cd87d9', 'aaaaaaaa-bbbb-cccc-dddd-000000000002')   -- Teste Squad
ON CONFLICT DO NOTHING;

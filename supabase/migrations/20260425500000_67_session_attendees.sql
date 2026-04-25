-- Migration 67: session_attendees + group_id em class_sessions
-- Permite marcar presença individual em aulas de dupla e em grupo

-- 1. group_id em class_sessions (liga sessão ao grupo, nullable)
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS class_sessions_group_id_idx ON class_sessions(group_id);

-- 2. Tabela de participantes por sessão (dupla / grupo)
CREATE TABLE IF NOT EXISTS session_attendees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'present', 'absent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS session_attendees_session_id_idx
  ON session_attendees(session_id);

ALTER TABLE session_attendees ENABLE ROW LEVEL SECURITY;

-- Professor vê e gerencia participantes das suas sessões
CREATE POLICY "teacher_manage_session_attendees" ON session_attendees
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM class_sessions cs
      WHERE cs.id = session_id
        AND cs.teacher_id = auth.uid()
    )
  );

-- Aluno vê sua própria presença
CREATE POLICY "student_view_own_attendance" ON session_attendees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_id
        AND s.user_id = auth.uid()
    )
  );

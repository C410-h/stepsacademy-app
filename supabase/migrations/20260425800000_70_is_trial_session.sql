-- Migration 70: Mark first session per student as trial (aula experimental)
-- Trial sessions count as 0.5 in teacher stats and display with brand color in agenda.

ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

-- Mark the earliest session per student as trial (retroactive)
UPDATE class_sessions cs
SET is_trial = true
WHERE cs.id IN (
  SELECT DISTINCT ON (student_id) id
  FROM class_sessions
  WHERE student_id IS NOT NULL
  ORDER BY student_id, scheduled_at ASC
);

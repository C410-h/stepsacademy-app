-- Add is_inherited flag to student_progress to track steps inherited from group
ALTER TABLE student_progress
  ADD COLUMN IF NOT EXISTS is_inherited boolean NOT NULL DEFAULT false;

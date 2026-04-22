-- Add current_step_id to groups so new students inherit the group's progress
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS current_step_id uuid REFERENCES steps(id) ON DELETE SET NULL;

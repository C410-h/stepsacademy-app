-- 71: full_name column + profile_completion_log

-- Add full_name (legal name) to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;

-- Tracking table for who received the "complete your profile" modal
CREATE TABLE IF NOT EXISTS profile_completion_log (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event      text        NOT NULL DEFAULT 'shown', -- 'shown' | 'completed'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profile_completion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON profile_completion_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','teacher')));

CREATE POLICY "own_profile_insert" ON profile_completion_log
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "own_profile_select" ON profile_completion_log
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- Seed full_name for the two students who already have their legal name set
UPDATE profiles
SET full_name = name
WHERE role = 'student'
  AND name IN ('Emanuele Benevides Beserra', 'Erick Cardoso dos Santos Carneiro');

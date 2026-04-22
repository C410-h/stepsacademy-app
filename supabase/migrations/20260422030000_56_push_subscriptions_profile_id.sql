-- Allow non-student users (admin, teacher) to have push subscriptions
-- 1. Make student_id nullable (was NOT NULL implicitly via FK)
ALTER TABLE public.push_subscriptions
  ALTER COLUMN student_id DROP NOT NULL;

-- 2. Add profile_id for admin/teacher subscriptions
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. Add index for fast admin push lookups
CREATE INDEX IF NOT EXISTS push_subscriptions_profile_id_idx
  ON public.push_subscriptions(profile_id);

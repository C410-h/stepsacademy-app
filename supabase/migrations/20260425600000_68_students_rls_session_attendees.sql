-- Migration 68: RLS policy allowing teachers to see students via session_attendees
-- NOTE: This migration was created and immediately superseded by migration 69.
-- The policy below was found to cause infinite recursion (students → class_sessions → students)
-- and was dropped in migration 69. This file is kept for history/tracking only.

-- (no-op — policy was applied and removed in the same deploy cycle)

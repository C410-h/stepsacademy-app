-- Migration 70: Add is_trial flag to class_sessions (aula experimental/diagnóstica)
-- Trial sessions: display with amber color, count 0.5 in teacher stats,
-- and skip step advancement when marked complete.
-- Teachers manually confirm trial status via a toggle in the session drawer.

ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

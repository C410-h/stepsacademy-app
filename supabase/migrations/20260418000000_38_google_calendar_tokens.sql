-- Migration 38: google_calendar_tokens
-- Adiciona colunas para armazenar tokens OAuth do Google Calendar em profiles.
-- Professores que não conectaram o Google ficam com NULL em todas as colunas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_refresh_token       text,
  ADD COLUMN IF NOT EXISTS google_access_token        text,
  ADD COLUMN IF NOT EXISTS google_token_expires_at    timestamptz;

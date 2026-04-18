-- Migration 39: adiciona birth_date em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;

-- 64_class_sessions_nullable_student
-- Torna student_id nullable para suportar aulas em dupla e em grupo,
-- que têm um único class_session sem student_id fixo.

alter table public.class_sessions
  alter column student_id drop not null;

-- Índice parcial: garante no máximo 1 row por google_event_id quando student_id é NULL
-- (PostgreSQL não considera dois NULLs iguais em constraints UNIQUE normais)
create unique index class_sessions_gcal_no_student_unique
  on public.class_sessions(google_event_id)
  where student_id is null;

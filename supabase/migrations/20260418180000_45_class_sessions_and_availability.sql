-- 45_class_sessions_and_availability
-- Cria grade de disponibilidade do professor e registro de sessões de aula.

-- =============================================================
-- enum: class_session_status
-- =============================================================
create type class_session_status as enum (
  'scheduled',
  'completed',
  'rescheduled',
  'missed_pending',
  'missed',
  'missed_recovered'
);

-- =============================================================
-- tabela: teacher_availability
-- =============================================================
create table public.teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  language_id uuid references public.languages(id),
  active boolean default true,
  created_at timestamptz default now(),
  constraint no_overlap unique (teacher_id, day_of_week, start_time)
);

-- =============================================================
-- tabela: class_sessions
-- =============================================================
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id),
  language_id uuid references public.languages(id),

  scheduled_at timestamptz not null,
  ends_at timestamptz not null,

  rescheduled_at timestamptz,
  rescheduled_ends_at timestamptz,

  google_event_id text,
  meet_link text,

  status class_session_status not null default 'scheduled',
  reschedule_count int not null default 0,

  parent_session_id uuid references public.class_sessions(id),

  missed_confirmed_at timestamptz,
  missed_confirmed_by uuid references public.profiles(id),

  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on public.class_sessions (teacher_id, scheduled_at);
create index on public.class_sessions (student_id, scheduled_at);
create index on public.class_sessions (status);

-- =============================================================
-- RLS
-- =============================================================
alter table public.class_sessions enable row level security;
alter table public.teacher_availability enable row level security;

create policy "teacher_own_sessions" on public.class_sessions
  for all using (
    teacher_id = auth.uid()
    or exists (
      select 1 from public.students s
      where s.id = class_sessions.student_id
        and s.user_id = auth.uid()
    )
  );

create policy "teacher_own_availability" on public.teacher_availability
  for all using (teacher_id = auth.uid());

create policy "student_own_sessions" on public.class_sessions
  for select using (
    exists (
      select 1 from public.students s
      where s.id = class_sessions.student_id
        and s.user_id = auth.uid()
    )
  );

create policy "admin_all_sessions" on public.class_sessions
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admin_all_availability" on public.teacher_availability
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

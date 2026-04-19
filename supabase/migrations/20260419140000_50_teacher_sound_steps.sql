-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 50: teacher_sound_steps
--
-- 1. Add is_sound_steps flag to teachers
-- 2. Mark manager@stepsacademy.com.br as Sound Steps
-- 3. Update auto-allocation trigger functions to exclude Sound Steps teachers
--    (keeps using teacher_languages join table — teachers has no language_id/active)
-- ─────────────────────────────────────────────────────────────────────────────

alter table teachers
  add column if not exists is_sound_steps boolean default false;

update teachers
set is_sound_steps = true
where user_id = (
  select id from auth.users
  where email = 'manager@stepsacademy.com.br'
  limit 1
);

-- ── Replace trigger functions (created in migration 49) ───────────────────────

create or replace function auto_allocate_single_teacher()
returns trigger as $$
declare
  v_teacher_id    uuid;
  v_teacher_count int;
  v_language_id   uuid;
begin
  v_language_id := NEW.language_id;
  if v_language_id is null then return NEW; end if;

  select count(*) into v_teacher_count
  from teacher_languages tl
  join teachers t on t.id = tl.teacher_id
  where tl.language_id = v_language_id
    and t.is_sound_steps = false;

  if v_teacher_count = 1 then
    select tl.teacher_id into v_teacher_id
    from teacher_languages tl
    join teachers t on t.id = tl.teacher_id
    where tl.language_id = v_language_id
      and t.is_sound_steps = false
    limit 1;

    insert into teacher_students (teacher_id, student_id)
    values (v_teacher_id, NEW.id)
    on conflict (teacher_id, student_id) do nothing;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create or replace function auto_allocate_on_teacher_language_insert()
returns trigger as $$
declare
  v_is_sound_steps boolean;
  v_teacher_count  int;
  v_student        record;
begin
  select is_sound_steps into v_is_sound_steps
  from teachers where id = NEW.teacher_id;

  if coalesce(v_is_sound_steps, false) = true then
    return NEW;
  end if;

  select count(*) into v_teacher_count
  from teacher_languages tl
  join teachers t on t.id = tl.teacher_id
  where tl.language_id = NEW.language_id
    and t.is_sound_steps = false;

  if v_teacher_count = 1 then
    for v_student in
      select s.id
      from students s
      left join teacher_students ts on ts.student_id = s.id
      where s.language_id = NEW.language_id
        and ts.student_id is null
    loop
      insert into teacher_students (teacher_id, student_id)
      values (NEW.teacher_id, v_student.id)
      on conflict (teacher_id, student_id) do nothing;
    end loop;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

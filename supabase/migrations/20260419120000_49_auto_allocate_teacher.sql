-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 49: auto_allocate_teacher
--
-- Rule: if a language has exactly 1 teacher (in teacher_languages), every
-- new student for that language is automatically linked via teacher_students.
-- When a second teacher is added the auto-allocation stops (existing links
-- are never removed).
--
-- Schema notes (verified before writing):
--   • teachers has NO language_id / active columns
--   • teacher_languages(teacher_id, language_id) is the join table;
--     teacher_id → teachers(id)
--   • teacher_students(teacher_id, student_id) UNIQUE;
--     teacher_id → teachers(id)   ← not profiles!
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Trigger fired after student INSERT or language_id UPDATE ───────────────

create or replace function auto_allocate_single_teacher()
returns trigger as $$
declare
  v_teacher_id   uuid;
  v_teacher_count int;
  v_language_id  uuid;
begin
  v_language_id := NEW.language_id;
  if v_language_id is null then return NEW; end if;

  select count(*) into v_teacher_count
  from teacher_languages
  where language_id = v_language_id;

  if v_teacher_count = 1 then
    select teacher_id into v_teacher_id
    from teacher_languages
    where language_id = v_language_id
    limit 1;

    insert into teacher_students (teacher_id, student_id)
    values (v_teacher_id, NEW.id)
    on conflict (teacher_id, student_id) do nothing;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_auto_allocate_teacher_on_student
  after insert on students
  for each row
  execute function auto_allocate_single_teacher();

create trigger trg_auto_allocate_teacher_on_language_change
  after update of language_id on students
  for each row
  when (OLD.language_id is distinct from NEW.language_id)
  execute function auto_allocate_single_teacher();

-- ── 2. Trigger fired after teacher_languages INSERT ───────────────────────────
--    (i.e. when a teacher is associated with a language for the first time)

create or replace function auto_allocate_on_teacher_language_insert()
returns trigger as $$
declare
  v_teacher_count int;
  v_student       record;
begin
  select count(*) into v_teacher_count
  from teacher_languages
  where language_id = NEW.language_id;

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

create trigger trg_auto_allocate_on_teacher_language_insert
  after insert on teacher_languages
  for each row
  execute function auto_allocate_on_teacher_language_insert();

-- ── 3. Retroactive: allocate existing students who have no teacher yet ─────────

do $$
declare
  v_lang         record;
  v_teacher_id   uuid;
  v_teacher_count int;
  v_student      record;
begin
  for v_lang in
    select distinct language_id from students where language_id is not null
  loop
    select count(*) into v_teacher_count
    from teacher_languages
    where language_id = v_lang.language_id;

    if v_teacher_count = 1 then
      select teacher_id into v_teacher_id
      from teacher_languages
      where language_id = v_lang.language_id
      limit 1;

      for v_student in
        select s.id
        from students s
        left join teacher_students ts on ts.student_id = s.id
        where s.language_id = v_lang.language_id
          and ts.student_id is null
      loop
        insert into teacher_students (teacher_id, student_id)
        values (v_teacher_id, v_student.id)
        on conflict (teacher_id, student_id) do nothing;
      end loop;
    end if;
  end loop;
end $$;

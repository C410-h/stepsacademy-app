create table profile_alternate_emails (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  email      text not null,
  label      text,
  created_at timestamptz default now(),
  constraint unique_alternate_email unique (email)
);

alter table profile_alternate_emails enable row level security;

create policy "admin_all" on profile_alternate_emails
  for all using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "student_own" on profile_alternate_emails
  for select using (profile_id = auth.uid());

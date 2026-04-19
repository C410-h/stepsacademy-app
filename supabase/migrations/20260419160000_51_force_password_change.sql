alter table profiles
  add column if not exists force_password_change boolean default false;

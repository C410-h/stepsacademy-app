alter table profiles
  add column if not exists teaching_languages jsonb default '[]',
  add column if not exists bio text,
  add column if not exists pix_key text,
  add column if not exists pix_key_type text
    check (pix_key_type in ('cpf','cnpj','email','phone','random'));

-- Original uploaded files live in the private `documents` Storage bucket; the row keeps the object path.
alter table public.documents add column if not exists file_path text not null default '';
alter table public.documents add column if not exists file_mime text not null default '';

-- Adds family membership (who may use which family) and per-notification delivery status.
-- Tables are created by the API on startup; this file adds what create_all cannot (ALTERs) and locks the new table down.

alter table public.notifications add column if not exists delivery text not null default 'in_app';

alter table public.family_members enable row level security;
revoke all on public.family_members from anon, authenticated;

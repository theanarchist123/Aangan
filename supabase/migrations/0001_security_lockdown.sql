-- Run AFTER the API has created its tables (app/db.py init_db -> SQLAlchemy create_all).
-- The tables live in Supabase's `public` schema, which Supabase exposes over a REST API that the public
-- anon key can reach. With RLS enabled and NO policies, that REST API returns nothing to anon/authenticated.
-- The Aangan API connects with the database role (which bypasses RLS) and enforces consent itself.
-- When clients start talking to Supabase directly, add per-family policies here (see
-- docs/target_schema_with_rls_policies.sql for the intended shape).

do $$
declare t text;
begin
  foreach t in array array[
    'families','people','tasks','task_steps','approvals','consents','documents','notifications',
    'audit_log','partners','usage_events','webhook_subs','webhook_deliveries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Audit log is append-only: no UPDATE or DELETE, for any role.
create or replace function public.audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

drop trigger if exists audit_no_update on public.audit_log;
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create extension if not exists vector;  -- semantic document search (embeddings column comes later)

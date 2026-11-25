-- Aangan core schema (Postgres 16 + pgvector). Targets Supabase (Mumbai region) or AWS RDS ap-south-1.
-- Mirrors services/api/app/models.py. Row-level security keeps every family's data separate and makes the
-- consent engine enforceable in the database itself, not just in application code.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  auto_approve_limit_inr integer not null default 2500 check (auto_approve_limit_inr >= 0),
  category_rules jsonb not null default '{}',
  device_public_key text not null default '',
  created_at timestamptz not null default now()
);

-- Which authenticated user belongs to which family, and in what capacity.
create table family_members (
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('sponsor','relative','neighbour','secretary','poa','caregiver','parent')),
  primary key (family_id, user_id)
);

create table people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  role text not null,
  city text not null default '',
  timezone text not null default 'Asia/Kolkata',
  language text not null default 'en',
  phone text not null default '',
  is_emergency_contact boolean not null default false,
  blood_group text not null default '',
  allergies jsonb not null default '[]',
  conditions jsonb not null default '[]',
  medications jsonb not null default '[]',
  -- Envelope-encrypted with a per-family data key (KMS). Never stored in clear in production.
  aadhaar_enc bytea,
  pan_enc bytea,
  last_checkin_at timestamptz
);
create index on people (family_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  goal text not null,
  kind text not null default 'general',
  status text not null default 'planning'
    check (status in ('planning','running','awaiting_approval','escalated','done','failed')),
  state jsonb not null default '{}',   -- durable LangGraph checkpoint
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks (family_id, created_at desc);

create table task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  seq integer not null,
  agent text not null,
  title text not null,
  detail text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (task_id, seq)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  action text not null,
  reason text not null,
  amount_inr integer not null default 0,
  category text not null default 'general',
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  challenge text not null default encode(gen_random_bytes(16), 'hex'),
  signature text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  grantee text not null,            -- person id | agent:<name> | partner:<id>
  scope text not null,              -- health.read | health.write | insurance.read | id.unmask ...
  granted boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on consents (family_id, grantee, scope, created_at desc);

create table documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  title text not null,
  category text not null default 'other',
  text text not null default '',
  extracted jsonb not null default '{}',
  storage_path text,                 -- encrypted object in the India-region bucket
  embedding vector(1024),            -- semantic retrieval over the vault
  created_at timestamptz not null default now()
);
create index on documents (family_id);
create index documents_embedding_idx on documents using hnsw (embedding vector_cosine_ops);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  task_id uuid,
  channel text not null,
  recipient text not null,
  message text not null,
  urgent boolean not null default false,
  created_at timestamptz not null default now()
);

-- Append-only, hash-chained audit log: updates and deletes are rejected by trigger.
create table audit_log (
  id bigserial primary key,
  family_id uuid not null,
  actor text not null,
  action text not null,
  payload jsonb not null default '{}',
  prev_hash text not null default '',
  hash text not null default '',
  created_at timestamptz not null default now()
);
create index on audit_log (family_id, id);

create function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- ---------------- partner platform ----------------
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('hospital','bank','insurer')),
  key_hash text not null unique,
  rate_limit_per_min integer not null default 60,
  created_at timestamptz not null default now()
);
create table usage_events (
  id bigserial primary key,
  partner_id uuid not null references partners(id),
  endpoint text not null,
  status integer not null default 200,
  created_at timestamptz not null default now()
);
create table webhook_subs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  url text not null,
  events jsonb not null default '[]',
  secret text not null
);

-- ---------------- row-level security ----------------
-- A user may touch only rows whose family they belong to.
create function is_family_member(fid uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from family_members m where m.family_id = fid and m.user_id = auth.uid())
$$;

alter table families enable row level security;
alter table family_members enable row level security;
alter table people enable row level security;
alter table tasks enable row level security;
alter table task_steps enable row level security;
alter table approvals enable row level security;
alter table consents enable row level security;
alter table documents enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

create policy member_read on families for select using (is_family_member(id));
create policy member_read on family_members for select using (user_id = auth.uid() or is_family_member(family_id));
create policy member_all on people for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy member_all on tasks for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy member_read on task_steps for select using (exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id)));
create policy member_all on approvals for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy member_all on consents for all using (is_family_member(family_id)) with check (is_family_member(family_id));
-- Documents: members read; only sponsors/POA see identity documents.
create policy member_read on documents for select using (
  is_family_member(family_id)
  and (category <> 'identity' or exists (
        select 1 from family_members m where m.family_id = documents.family_id and m.user_id = auth.uid() and m.role in ('sponsor','poa')))
);
create policy member_write on documents for insert with check (is_family_member(family_id));
create policy member_read on notifications for select using (is_family_member(family_id));
create policy member_read on audit_log for select using (is_family_member(family_id));

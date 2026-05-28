-- =============================================================================
-- Migration 005 — Companies & Platforms taxonomy
--
-- Adds two new tagging dimensions for SOPs:
--   companies   — client/brand entities (e.g. Get Living, Under The Doormat)
--   platforms   — software tools an SOP relates to (e.g. Pricelabs, Rentals
--                 United, Airbnb)
--
-- Soft-deletion via `is_active` so historical SOP tags stay intact when an
-- entity is retired. Multi-select on SOPs via junction tables that mirror
-- the existing `sop_teams` pattern.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique active names — prevents duplicate active tags. Allows reusing a
-- name only after the previous record is deactivated.
create unique index if not exists companies_active_name_uniq
  on companies (lower(name)) where is_active;

create unique index if not exists platforms_active_name_uniq
  on platforms (lower(name)) where is_active;

-- ---------------------------------------------------------------------------
-- JUNCTIONS (SOP <-> companies / platforms)
-- ---------------------------------------------------------------------------

create table if not exists sop_companies (
  sop_id uuid not null references sops(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  primary key (sop_id, company_id)
);

create table if not exists sop_platforms (
  sop_id uuid not null references sops(id) on delete cascade,
  platform_id uuid not null references platforms(id) on delete cascade,
  primary key (sop_id, platform_id)
);

-- Index the foreign side for fast filter queries (e.g. "all SOPs for
-- platform=Pricelabs").
create index if not exists sop_companies_company_id_idx on sop_companies(company_id);
create index if not exists sop_platforms_platform_id_idx on sop_platforms(platform_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on companies;
create trigger companies_set_updated_at
  before update on companies
  for each row execute function set_updated_at();

drop trigger if exists platforms_set_updated_at on platforms;
create trigger platforms_set_updated_at
  before update on platforms
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--
-- Reads: any authenticated user (needed for SOP form dropdowns + filter UI).
-- Writes on the entity tables: super_admin only.
-- Writes on the SOP junctions: matches the existing sop_teams policy
-- (any SOP author or admin role).
-- ---------------------------------------------------------------------------

alter table companies enable row level security;
alter table platforms enable row level security;
alter table sop_companies enable row level security;
alter table sop_platforms enable row level security;

-- SELECT policies (any authenticated user)
drop policy if exists "Authenticated can read companies" on companies;
create policy "Authenticated can read companies" on companies
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated can read platforms" on platforms;
create policy "Authenticated can read platforms" on platforms
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated can read sop_companies" on sop_companies;
create policy "Authenticated can read sop_companies" on sop_companies
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated can read sop_platforms" on sop_platforms;
create policy "Authenticated can read sop_platforms" on sop_platforms
  for select using (auth.uid() is not null);

-- Write policies — companies/platforms restricted to super_admin
drop policy if exists "Super admins can manage companies" on companies;
create policy "Super admins can manage companies" on companies
  for all using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

drop policy if exists "Super admins can manage platforms" on platforms;
create policy "Super admins can manage platforms" on platforms
  for all using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- Write policies — sop junctions match existing sop_teams pattern
drop policy if exists "Authors and admins can manage sop_companies" on sop_companies;
create policy "Authors and admins can manage sop_companies" on sop_companies
  for all using (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  )
  with check (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  );

drop policy if exists "Authors and admins can manage sop_platforms" on sop_platforms;
create policy "Authors and admins can manage sop_platforms" on sop_platforms
  for all using (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  )
  with check (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  );

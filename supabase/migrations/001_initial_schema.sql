-- =============================================================================
-- Hospiria Knowledge Base — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- Teams
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- User profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text check (role in ('super_admin','approver','author','agent')) not null default 'agent',
  primary_team_id uuid references teams(id),
  created_at timestamptz default now()
);

-- Cross-team access grants
create table if not exists team_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  granted_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique(user_id, team_id)
);

-- Categories within teams
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  display_order int default 0,
  created_at timestamptz default now()
);

-- SOPs
create table if not exists sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content jsonb,
  category_id uuid references categories(id),
  status text check (status in ('draft','submitted','changes_requested','live','archived')) default 'draft',
  author_id uuid references profiles(id),
  current_version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Multi-team tagging (one SOP visible to multiple teams)
create table if not exists sop_teams (
  sop_id uuid references sops(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  primary key (sop_id, team_id)
);

-- Full version snapshots
create table if not exists sop_versions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade,
  content jsonb not null,
  version_number int not null,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);

-- Approval workflow
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade,
  approver_id uuid references profiles(id),
  status text check (status in ('pending','approved','rejected','changes_requested')),
  comment text,
  created_at timestamptz default now()
);

-- In-app notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  message text not null,
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'agent')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Auto-update updated_at on SOPs
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sops_updated_at on sops;
create trigger sops_updated_at
  before update on sops
  for each row execute procedure update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_access enable row level security;
alter table categories enable row level security;
alter table sops enable row level security;
alter table sop_teams enable row level security;
alter table sop_versions enable row level security;
alter table approvals enable row level security;
alter table notifications enable row level security;

-- Helper function: get current user's role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper function: get current user's primary team
create or replace function get_my_team_id()
returns uuid as $$
  select primary_team_id from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper function: check if user has access to a team
create or replace function has_team_access(team_id_param uuid)
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and primary_team_id = team_id_param
    union
    select 1 from team_access where user_id = auth.uid() and team_id = team_id_param
  )
$$ language sql security definer stable;

-- PROFILES policies
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

create policy "Super admins can view all profiles" on profiles
  for select using (get_my_role() = 'super_admin');

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

create policy "Super admins can update all profiles" on profiles
  for update using (get_my_role() = 'super_admin');

create policy "Super admins can insert profiles" on profiles
  for insert with check (get_my_role() = 'super_admin');

-- TEAMS policies
create policy "Authenticated users can view teams" on teams
  for select using (auth.role() = 'authenticated');

create policy "Super admins can manage teams" on teams
  for all using (get_my_role() = 'super_admin');

-- TEAM_ACCESS policies
create policy "Super admins can manage team access" on team_access
  for all using (get_my_role() = 'super_admin');

create policy "Users can view own team access" on team_access
  for select using (user_id = auth.uid());

-- CATEGORIES policies
create policy "Authenticated users can view categories" on categories
  for select using (auth.role() = 'authenticated');

create policy "Super admins can manage categories" on categories
  for all using (get_my_role() = 'super_admin');

create policy "Approvers can manage categories for their team" on categories
  for all using (
    get_my_role() = 'approver' and team_id = get_my_team_id()
  );

-- SOPS policies
create policy "Authors can create SOPs" on sops
  for insert with check (
    get_my_role() in ('author', 'super_admin')
  );

create policy "Authors can view/update own drafts" on sops
  for select using (
    auth.uid() = author_id
    or get_my_role() in ('super_admin', 'approver')
    or (
      status = 'live'
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )
  );

create policy "Authors can update own SOPs" on sops
  for update using (
    auth.uid() = author_id
    or get_my_role() = 'super_admin'
    or (get_my_role() = 'approver')
  );

create policy "Super admins can delete SOPs" on sops
  for delete using (get_my_role() = 'super_admin');

-- SOP_TEAMS policies
create policy "Anyone authenticated can view sop_teams" on sop_teams
  for select using (auth.role() = 'authenticated');

create policy "Authors and super admins can manage sop_teams" on sop_teams
  for all using (
    get_my_role() in ('super_admin', 'author', 'approver')
  );

-- SOP_VERSIONS policies
create policy "Authors and admins can view versions" on sop_versions
  for select using (
    get_my_role() in ('super_admin', 'approver', 'author')
    or exists (
      select 1 from sops s
      join sop_teams st on st.sop_id = s.id
      where s.id = sop_id and has_team_access(st.team_id)
    )
  );

create policy "System can insert versions" on sop_versions
  for insert with check (get_my_role() in ('super_admin', 'approver'));

-- APPROVALS policies
create policy "Approvers can manage approvals for their team" on approvals
  for all using (
    get_my_role() = 'super_admin'
    or auth.uid() = approver_id
  );

create policy "Authors can view approvals for their SOPs" on approvals
  for select using (
    exists (select 1 from sops where id = sop_id and author_id = auth.uid())
  );

-- NOTIFICATIONS policies
create policy "Users can view own notifications" on notifications
  for select using (user_id = auth.uid());

create policy "Users can update own notifications" on notifications
  for update using (user_id = auth.uid());

create policy "System can insert notifications" on notifications
  for insert with check (true);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Teams
insert into teams (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Onboarding'),
  ('00000000-0000-0000-0000-000000000002', 'Reservations'),
  ('00000000-0000-0000-0000-000000000003', 'Guest Services')
on conflict do nothing;

-- Categories for Onboarding team
insert into categories (team_id, name, display_order) values
  ('00000000-0000-0000-0000-000000000001', 'Trackers & Team Management', 1),
  ('00000000-0000-0000-0000-000000000001', 'Property Setup on Hospiria (PMS)', 2),
  ('00000000-0000-0000-0000-000000000001', 'PriceLabs', 3),
  ('00000000-0000-0000-0000-000000000001', 'Rentals United', 4),
  ('00000000-0000-0000-0000-000000000001', 'Platform Onboarding — B2C', 5),
  ('00000000-0000-0000-0000-000000000001', 'Platform Onboarding — B2B', 6),
  ('00000000-0000-0000-0000-000000000001', 'Hospiria Partner Onboarding', 7),
  ('00000000-0000-0000-0000-000000000001', 'Veeve London / Paris Onboarding', 8),
  ('00000000-0000-0000-0000-000000000001', 'Listing Updates', 9),
  ('00000000-0000-0000-0000-000000000001', 'Policies', 10),
  ('00000000-0000-0000-0000-000000000001', 'Deactivation, Deletion & Reactivation', 11),
  ('00000000-0000-0000-0000-000000000001', 'Contacts & Reference', 12)
on conflict do nothing;

-- =============================================================================
-- Migration 009 — Editable permissions (Phase 1: foundation)
--
-- Adds two tables that let a super admin tune what each role / user can VIEW
-- and EDIT per feature, on top of the existing `role` column:
--
--   role_permissions  — overrides to a role's default permissions (the
--                       "templates"). Sparse: a row only exists where an admin
--                       has set it. Absent feature => fall back to the code
--                       default (which reproduces today's behaviour).
--   user_permissions  — per-user overrides. Sparse. Absent feature => inherit
--                       from the user's role.
--
-- Effective permission for a user+feature =
--   user_permissions row  ??  role_permissions row (for their role)
--                          ??  code default for that role+feature.
--
-- PHASE 1 IS NON-ENFORCING: these tables + the admin UI let you configure
-- permissions, but nothing changes a user's access yet. Enforcement (server
-- route guards, then database RLS via a has_perm() function) lands in later
-- phases. Seeded defaults live in code (src/lib/permissions.ts) so no row
-- seeding is required here and today's access is unchanged.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists role_permissions (
  role       text not null,
  feature    text not null,
  can_view   boolean not null default false,
  can_edit   boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  primary key (role, feature)
);

create table if not exists user_permissions (
  user_id    uuid not null references profiles(id) on delete cascade,
  feature    text not null,
  can_view   boolean not null default false,
  can_edit   boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  primary key (user_id, feature)
);

create index if not exists user_permissions_user_idx on user_permissions(user_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--   read  — role_permissions: any authenticated user (resolver needs it).
--           user_permissions: your own rows, or super_admin sees all.
--   write — super_admin only (the admin UI writes via the service role).
-- ---------------------------------------------------------------------------
alter table role_permissions enable row level security;
alter table user_permissions enable row level security;

drop policy if exists "read role_permissions" on role_permissions;
create policy "read role_permissions" on role_permissions
  for select using (auth.uid() is not null);

drop policy if exists "manage role_permissions" on role_permissions;
create policy "manage role_permissions" on role_permissions
  for all using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

drop policy if exists "read own user_permissions" on user_permissions;
create policy "read own user_permissions" on user_permissions
  for select using (user_id = auth.uid() or get_my_role() = 'super_admin');

drop policy if exists "manage user_permissions" on user_permissions;
create policy "manage user_permissions" on user_permissions
  for all using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

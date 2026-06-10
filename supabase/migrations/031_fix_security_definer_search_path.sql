-- =============================================================================
-- Migration 031 — Harden SECURITY DEFINER functions + pin UPDATE WITH CHECK
--
-- PROBLEM: get_my_role() and has_perm() were created without SET search_path.
-- Per PostgreSQL docs, a SECURITY DEFINER function without a fixed search_path
-- inherits the *caller's* current search_path. Because the function runs as
-- its owner (postgres) but resolves names using the caller's path, there is a
-- window for subtle resolution bugs if the caller's path is unexpected.
--
-- More concretely: Supabase flags this as a "Security Definer View / Function
-- without SET search_path" linter warning. While it's primarily a security
-- concern, it can also cause `auth.uid()` or table lookups to resolve
-- differently in edge-case session configurations — which may explain why
-- has_perm() appears to return the correct value when simulated from the SQL
-- editor (which runs as postgres with a fixed path) but fails at RLS
-- evaluation time for certain users.
--
-- FIX (two parts):
--   A. Re-create get_my_role() and has_perm() with
--      SET search_path = 'public', 'pg_catalog'
--      so all name resolution is deterministic regardless of caller's path.
--
--   B. Make the sops UPDATE policy's WITH CHECK *explicit* (same expression as
--      USING). PostgreSQL defaults to using USING as WITH CHECK when the clause
--      is omitted, but making it explicit removes any ambiguity in older or
--      future PostgreSQL planner versions.
--
-- DIAGNOSTIC: If the problem persists after this migration, run the query
-- below in the Supabase SQL Editor to confirm has_perm logic for Nicaela:
--
--   select coalesce(
--     (select case when true then up.can_edit else (up.can_view or up.can_edit) end
--        from user_permissions up
--       where up.user_id = '56eb4e62-92ed-4604-8872-cb036b4d2a7d' and up.feature = 'sops'),
--     (select case when true then rp.can_edit else (rp.can_view or rp.can_edit) end
--        from role_permissions rp
--       where rp.role = 'team_leader' and rp.feature = 'sops'),
--     false
--   ) as simulated_has_perm;
--
--   -- Should return: true
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================


-- =============================================================================
-- PART A — Re-create helper functions with fixed search_path
-- =============================================================================

-- get_my_role(): reads the current user's role from profiles.
-- set search_path prevents any schema-injection risk and ensures `profiles`
-- always resolves to public.profiles.
create or replace function get_my_role()
returns text
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
as $$
  select role from profiles where id = auth.uid()
$$;

-- get_my_team_id(): reads the current user's primary team.
create or replace function get_my_team_id()
returns uuid
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
as $$
  select primary_team_id from profiles where id = auth.uid()
$$;

-- has_team_access(): checks team membership.
create or replace function has_team_access(team_id_param uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and primary_team_id = team_id_param
    union
    select 1 from team_access where user_id = auth.uid() and team_id = team_id_param
  )
$$;

-- has_perm(): the core permission resolver used in RLS policies.
-- Resolving order: super_admin → user_permissions override → role_permissions → false
create or replace function has_perm(feature_key text, need_edit boolean)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
as $$
  select case
    when get_my_role() = 'super_admin' then true
    else coalesce(
      (select case when need_edit then up.can_edit else (up.can_view or up.can_edit) end
         from user_permissions up
        where up.user_id = auth.uid() and up.feature = feature_key),
      (select case when need_edit then rp.can_edit else (rp.can_view or rp.can_edit) end
         from role_permissions rp
        where rp.role = get_my_role() and rp.feature = feature_key),
      false
    )
  end
$$;


-- =============================================================================
-- PART B — Make sops UPDATE policy WITH CHECK explicit
-- =============================================================================

drop policy if exists "Authors can update SOPs" on sops;
create policy "Authors can update SOPs" on sops
  for update
  using     (has_perm('sops'::text, true))
  with check (has_perm('sops'::text, true));

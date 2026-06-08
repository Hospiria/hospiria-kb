-- =============================================================================
-- Migration 030 — Align all RLS write policies with the permission system
--
-- PROBLEM: The permission system has two layers:
--   1. TypeScript code defaults (src/lib/permissions.ts DEFAULT_ROLE_PERMISSIONS)
--   2. Database tables (role_permissions, user_permissions)
-- The has_perm() SQL function reads ONLY from the database tables (#2), not from
-- the TypeScript defaults (#1). So if a feature is not seeded in role_permissions,
-- has_perm() returns false for every non-super-admin user — even if the TypeScript
-- defaults say they should have access.
--
-- Migration 010 only seeded sops edit for approver/team_leader/junior_team_leader.
-- All other features were left without rows, making has_perm() return false for
-- them at the DB layer, even though the TypeScript route guards accepted requests
-- based on the code defaults.
--
-- ADDITIONALLY: quizzes and notification_settings write policies were still
-- hard-coded to get_my_role() = 'super_admin', so even a permission grant from
-- the admin UI had no effect on the database layer.
--
-- FIX (three parts):
--
--   A. Seed the complete role_permissions table to match DEFAULT_ROLE_PERMISSIONS
--      in src/lib/permissions.ts. ON CONFLICT DO NOTHING preserves admin overrides.
--
--   B. Fix notification_settings RLS — replace super_admin hard-code with has_perm().
--      Default: only super_admin can access (no role_permissions rows for other roles).
--      Admin can grant access to any user or role via the permissions UI.
--
--   C. Fix quizzes / quiz_enrollments RLS — replace super_admin hard-code with
--      has_perm('quizzes', true). Default: only super_admin can write (quizzes:edit
--      is not seeded for other roles below). Admin can grant quiz management to any
--      user via the permissions UI.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================


-- =============================================================================
-- PART A — Seed complete role_permissions to match TypeScript code defaults
--
-- This makes has_perm() return the same values as the TS route guards.
-- Roles omitted: super_admin (has_perm short-circuits to true).
-- Features omitted: any with NONE default for that role (has_perm returns false
-- when no row exists — matching NONE).
-- ON CONFLICT DO NOTHING: preserves any permission changes the admin has already
-- made in the UI.
-- =============================================================================

insert into role_permissions (role, feature, can_view, can_edit) values

  -- approver: dashboard(view), chat(view), notes(all), sop_notes(all),
  --           sops(all), approve_sops(all), quizzes(view)
  ('approver', 'dashboard',    true,  false),
  ('approver', 'chat',         true,  false),
  ('approver', 'notes',        true,  true),
  ('approver', 'sop_notes',    true,  true),
  ('approver', 'sops',         true,  true),   -- already seeded in 010, conflict ignored
  ('approver', 'approve_sops', true,  true),
  ('approver', 'quizzes',      true,  false),

  -- team_leader: dashboard(view), chat(view), notes(all), sop_notes(all),
  --              sops(all), approve_sops(all), quizzes(view)
  ('team_leader', 'dashboard',    true,  false),
  ('team_leader', 'chat',         true,  false),
  ('team_leader', 'notes',        true,  true),
  ('team_leader', 'sop_notes',    true,  true),
  ('team_leader', 'sops',         true,  true),   -- already seeded in 010
  ('team_leader', 'approve_sops', true,  true),
  ('team_leader', 'quizzes',      true,  false),

  -- junior_team_leader: dashboard(view), chat(view), notes(all), sop_notes(all),
  --                     sops(all), approve_sops(none→omitted), quizzes(view)
  ('junior_team_leader', 'dashboard', true,  false),
  ('junior_team_leader', 'chat',      true,  false),
  ('junior_team_leader', 'notes',     true,  true),
  ('junior_team_leader', 'sop_notes', true,  true),
  ('junior_team_leader', 'sops',      true,  true),   -- already seeded in 010
  ('junior_team_leader', 'quizzes',   true,  false),

  -- agent: dashboard(view), chat(view), notes(all), sop_notes(all),
  --        sops(view), approve_sops(none→omitted), quizzes(view)
  ('agent', 'dashboard', true,  false),
  ('agent', 'chat',      true,  false),
  ('agent', 'notes',     true,  true),
  ('agent', 'sop_notes', true,  true),
  ('agent', 'sops',      true,  false),
  ('agent', 'quizzes',   true,  false)

on conflict (role, feature) do nothing;


-- =============================================================================
-- PART B — notification_settings: replace super_admin hard-code with has_perm()
--
-- Default behaviour is preserved: no role_permissions rows exist for
-- 'notifications' for non-super-admin roles, so has_perm() returns false for
-- them — same as before. Only super_admin or users individually granted
-- notifications:view/edit in the admin UI can access these rows.
-- =============================================================================

drop policy if exists "super_admin manages notification settings" on notification_settings;

-- SELECT: requires notifications view permission
create policy "read notification_settings" on notification_settings
  for select using (has_perm('notifications', false));

-- WRITE (update is the only operation in practice — rows are seeded, not inserted by users)
create policy "manage notification_settings" on notification_settings
  for update using    (has_perm('notifications', true))
  with check          (has_perm('notifications', true));


-- =============================================================================
-- PART C — quizzes / quiz_enrollments: replace super_admin hard-code with
-- has_perm('quizzes', true)
--
-- Default behaviour is preserved: quizzes:edit is only for super_admin by
-- default (no role_permissions rows seeded for edit). team_leader etc. can
-- take quizzes (quizzes:view seeded above) but cannot manage them unless the
-- admin explicitly grants quizzes:edit via the permissions UI.
-- =============================================================================

-- quizzes write
drop policy if exists "quizzes_insert" on quizzes;
create policy "quizzes_insert" on quizzes
  for insert to authenticated with check (has_perm('quizzes', true));

drop policy if exists "quizzes_update" on quizzes;
create policy "quizzes_update" on quizzes
  for update to authenticated using (has_perm('quizzes', true));

drop policy if exists "quizzes_delete" on quizzes;
create policy "quizzes_delete" on quizzes
  for delete to authenticated using (has_perm('quizzes', true));

-- quiz_enrollments write
-- INSERT: only quiz managers (quizzes:edit) can enrol users
drop policy if exists "enrollments_insert" on quiz_enrollments;
create policy "enrollments_insert" on quiz_enrollments
  for insert to authenticated with check (has_perm('quizzes', true));

-- UPDATE: quiz managers can update any enrollment; users can update their own
-- (marking progress, submitting attempts)
drop policy if exists "enrollments_update" on quiz_enrollments;
create policy "enrollments_update" on quiz_enrollments
  for update to authenticated
  using (has_perm('quizzes', true) or user_id = auth.uid());

-- DELETE: only quiz managers can remove enrollments
drop policy if exists "enrollments_delete" on quiz_enrollments;
create policy "enrollments_delete" on quiz_enrollments
  for delete to authenticated using (has_perm('quizzes', true));

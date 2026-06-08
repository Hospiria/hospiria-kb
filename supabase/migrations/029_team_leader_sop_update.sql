-- =============================================================================
-- Migration 029 — Make SOPs UPDATE policy respect the permission system
--
-- PROBLEM: Migration 010 wrote the SOPs UPDATE policy as:
--
--   has_perm('sops', true)
--   AND (auth.uid() = author_id OR get_my_role() IN ('super_admin', 'approver'))
--
-- This creates two independent gates. has_perm() correctly checks
-- user_permissions → role_permissions → false, which is the admin-controlled
-- permission system. But the second AND'd clause hard-codes a role list that
-- overrides it: even if an admin explicitly grants sops:edit to a team_leader
-- or any other user, the hard-coded role list will still block their UPDATE.
--
-- This is why a team_leader with correct permissions in the admin UI cannot
-- save edits to a SOP they did not author — has_perm() returns true but the
-- role check fails.
--
-- FIX: Remove the hard-coded role/author check. has_perm('sops', true) is
-- already the correct and complete gate:
--   - super_admin: has_perm short-circuits to true
--   - role_permissions row (team_leader, approver, junior_team_leader seeded in 010)
--   - user_permissions row (individual admin overrides)
--   - anything else: false
--
-- After this migration, the admin UI is the sole authority on who can edit
-- SOPs. No future SQL is needed to add or remove edit rights for a role.
--
-- NOTE: Scoping (which SOPs are visible/editable) is already enforced by the
-- SELECT policy from migration 021 — a team_leader can only see their team's
-- SOPs, so they can only reach the edit page for SOPs in their team.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

drop policy if exists "Authors can update SOPs" on sops;

create policy "Authors can update SOPs" on sops
  for update using (has_perm('sops', true));

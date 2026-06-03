-- =============================================================================
-- Migration 010 — Permissions Phase 3: database enforcement (RLS)
--
-- Makes the feature permissions REAL at the database layer via has_perm(),
-- so a "view only" user genuinely cannot write even outside the app UI.
--
-- DESIGNED TO PRESERVE TODAY'S ACCESS EXACTLY:
--   * has_perm() short-circuits super_admin → always true.
--   * The seed gives approver / team_leader / junior_team_leader the same SOP
--     edit rights they have today; everything else stays super_admin-only
--     (which is what the code defaults already encode).
--   * Only WRITE policies are rewritten, and SOP update keeps its ownership
--     clause (ANDed with has_perm) so authors don't lose their own drafts.
--   * SELECT, auth, profiles, approvals, quizzes and category policies are left
--     untouched to avoid any read/lockout risk.
--
-- AFTER RUNNING: immediately confirm SOP create/edit still works for a normal
-- editor, and that a user you set to "view only" on SOPs can no longer edit.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART A — has_perm() + seed (safe; changes no policy on its own)
-- ---------------------------------------------------------------------------

-- Effective permission check for the current user.
--   need_edit = true  → requires edit
--   need_edit = false → requires view (edit implies view)
-- Resolution: super_admin → true; else user override; else role default; else false.
create or replace function has_perm(feature_key text, need_edit boolean)
returns boolean
language sql
stable
security definer
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

-- Seed the SOP edit grant for the non-admin roles that have it today. Other
-- features stay super_admin-only by default (handled by the short-circuit), so
-- they need no seed. ON CONFLICT DO NOTHING preserves any admin-saved overrides.
insert into role_permissions (role, feature, can_view, can_edit) values
  ('approver',           'sops', true, true),
  ('team_leader',        'sops', true, true),
  ('junior_team_leader', 'sops', true, true)
on conflict (role, feature) do nothing;

-- ---------------------------------------------------------------------------
-- PART B — rewrite WRITE policies to use has_perm()
-- (Reads remain governed by the existing SELECT policies, untouched.)
-- ---------------------------------------------------------------------------

-- SOPs: create + update (update keeps the ownership/role clause, ANDed with perm)
drop policy if exists "Authors can create SOPs" on sops;
create policy "Authors can create SOPs" on sops
  for insert with check (has_perm('sops', true));

drop policy if exists "Authors can update SOPs" on sops;
create policy "Authors can update SOPs" on sops
  for update using (
    has_perm('sops', true)
    and (auth.uid() = author_id or get_my_role() in ('super_admin', 'approver'))
  );

-- SOP ↔ teams / companies / platforms / links: manage requires sops edit.
-- (Each table has a separate authenticated-read policy, so reads are unaffected.)
drop policy if exists "Authors and super admins can manage sop_teams" on sop_teams;
create policy "Authors and super admins can manage sop_teams" on sop_teams
  for all using (has_perm('sops', true)) with check (has_perm('sops', true));

drop policy if exists "Authors and admins can manage sop_companies" on sop_companies;
create policy "Authors and admins can manage sop_companies" on sop_companies
  for all using (has_perm('sops', true)) with check (has_perm('sops', true));

drop policy if exists "Authors and admins can manage sop_platforms" on sop_platforms;
create policy "Authors and admins can manage sop_platforms" on sop_platforms
  for all using (has_perm('sops', true)) with check (has_perm('sops', true));

drop policy if exists "Authors and admins can manage sop_links" on sop_links;
create policy "Authors and admins can manage sop_links" on sop_links
  for all using (has_perm('sops', true)) with check (has_perm('sops', true));

-- Companies / Platforms tag tables: manage requires the matching feature edit.
drop policy if exists "Super admins can manage companies" on companies;
create policy "Super admins can manage companies" on companies
  for all using (has_perm('companies', true)) with check (has_perm('companies', true));

drop policy if exists "Super admins can manage platforms" on platforms;
create policy "Super admins can manage platforms" on platforms
  for all using (has_perm('platforms', true)) with check (has_perm('platforms', true));

-- Teams: manage requires teams edit.
drop policy if exists "Super admins can manage teams" on teams;
create policy "Super admins can manage teams" on teams
  for all using (has_perm('teams', true)) with check (has_perm('teams', true));

-- NOT CHANGED (left on their existing policies to avoid regression — these are
-- enforced at the app layer in phase 2, and/or their writes go via the
-- service role which bypasses RLS):
--   profiles, approvals, sop_versions, categories, quizzes/quiz_*,
--   notifications, bot_instructions, role_permissions, user_permissions.

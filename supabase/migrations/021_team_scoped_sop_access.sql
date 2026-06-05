-- =============================================================================
-- Migration 021 — Team-scoped SOP access
--
-- PROBLEM: The SOP select policy in migration 003 gave team_leader and
-- approver unrestricted read access to ALL SOPs (any team's). A Guest
-- Services team leader could read Reservations SOPs.
--
-- FIX: team_leader and approver can only see:
--   a) SOPs they authored (any status)
--   b) Live SOPs in their own team
--   c) Submitted SOPs in their own team (to approve)
--   d) Drafts/in-review SOPs where they are the author
--
-- super_admin retains full access.
-- Agents/junior_team_leaders were already correctly restricted to live SOPs
-- in their team via has_team_access().
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

-- Drop the policy from migration 003 that was too permissive
drop policy if exists "Authors can view own drafts" on sops;

-- New scoped policy
create policy "Users can view SOPs for their team" on sops
  for select using (
    -- Super admin: sees everything
    get_my_role() = 'super_admin'

    -- Author of the SOP: always sees their own work
    or auth.uid() = author_id

    -- Live SOPs that belong to a team the user is a member of
    or (
      status = 'live'
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )

    -- Submitted SOPs for a team the user can approve (team_leader/approver in that team)
    or (
      status in ('submitted', 'changes_requested')
      and get_my_role() in ('approver', 'team_leader')
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )
  );

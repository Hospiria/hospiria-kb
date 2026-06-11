-- =============================================================================
-- Migration 035 — Editors can see any-status SOPs in their own team
--
-- WHY: Migration 021 scopes SOP visibility by status — a non-author team_leader
-- can see a SOP only while it's 'live' (or 'submitted'/'changes_requested' if
-- they're an approver/team_leader). PostgreSQL rejects an UPDATE whose NEW row
-- would fall outside the actor's SELECT visibility (error 42501, "new row
-- violates row-level security policy"). So any status transition that moves a
-- SOP into a state the editor can't see — e.g. Save demoting live->draft, or a
-- junior_team_leader submitting a live SOP they didn't author — fails the save.
--
-- The SopEditor "Save" demotion was the main trigger and is fixed in the app.
-- This migration removes the WHOLE class at the database layer: if you may EDIT
-- SOPs (has_perm('sops', true)) and the SOP belongs to a team you're in, you may
-- also SEE it, in ANY status. Cross-team scoping from migration 021 is preserved
-- (visibility is still gated by has_team_access on the SOP's own sop_teams).
--
-- Trade-off (intended): editors can now see draft / submitted SOPs authored by
-- others *within their own team* — collaboration-friendly, and required for
-- team_leaders/junior_team_leaders to manage their team's SOPs through every
-- workflow state without hitting a save error.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

drop policy if exists "Users can view SOPs for their team" on sops;

create policy "Users can view SOPs for their team" on sops
  for select using (
    -- Super admin: sees everything
    get_my_role() = 'super_admin'

    -- Author: always sees their own work, any status
    or auth.uid() = author_id

    -- Live SOPs in a team the user belongs to
    or (
      status = 'live'
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )

    -- Submitted / changes-requested SOPs for approvers & team leaders in that team
    or (
      status = any (array['submitted', 'changes_requested'])
      and get_my_role() = any (array['approver', 'team_leader'])
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )

    -- NEW: anyone who can EDIT SOPs can see ANY-status SOP in a team they're in.
    -- Removes the "update into invisibility" 42501 class for all roles/transitions.
    -- Still team-scoped — no cross-team exposure.
    or (
      has_perm('sops', true)
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )
  );

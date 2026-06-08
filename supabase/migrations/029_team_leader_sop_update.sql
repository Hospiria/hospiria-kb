-- =============================================================================
-- Migration 029 — Allow team_leader to update SOPs in their team
--
-- PROBLEM: Migration 010 wrote the SOPs UPDATE policy allowing only
--   auth.uid() = author_id  OR  role IN ('super_admin', 'approver')
-- team_leader was never included. A team leader who did not author a SOP
-- gets Postgres error 42501 (permission denied) when saving edits, even
-- though the UI correctly shows the Save / Publish buttons for their role.
--
-- FIX: Extend the UPDATE policy so a team_leader can update any SOP that
-- belongs to at least one team they have access to (same team-scope logic
-- used in the SELECT policy added in migration 021).
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

drop policy if exists "Authors can update SOPs" on sops;

create policy "Authors can update SOPs" on sops
  for update using (
    has_perm('sops', true)
    and (
      -- SOP author can always edit their own SOP
      auth.uid() = author_id

      -- Super admin and approver have blanket update rights
      or get_my_role() in ('super_admin', 'approver')

      -- Team leader can edit SOPs that belong to their team
      or (
        get_my_role() = 'team_leader'
        and exists (
          select 1 from sop_teams st
          where st.sop_id = sops.id
            and has_team_access(st.team_id)
        )
      )
    )
  );

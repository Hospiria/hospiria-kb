-- New role structure:
-- agent              → read-only, take quizzes
-- junior_team_leader → create SOPs, take quizzes
-- team_leader        → create SOPs, take quizzes, approve
-- approver           → create/edit any SOP, approve
-- super_admin        → full access

-- Step 1: Drop old constraint
alter table profiles drop constraint if exists profiles_role_check;

-- Step 2: Migrate existing 'author' roles to 'junior_team_leader'
update profiles set role = 'junior_team_leader' where role = 'author';

-- Step 3: Add new constraint
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'approver', 'team_leader', 'junior_team_leader', 'agent'));

-- Step 4: Update RLS policies

-- Categories: team leaders can manage their team's categories
drop policy if exists "Approvers can manage categories for their team" on categories;
create policy "Team leaders can manage categories" on categories
  for all using (
    get_my_role() in ('approver', 'team_leader') and team_id = get_my_team_id()
  );

-- SOPs: who can create
drop policy if exists "Authors can create SOPs" on sops;
create policy "Authors can create SOPs" on sops
  for insert with check (
    get_my_role() in ('junior_team_leader', 'team_leader', 'approver', 'super_admin')
  );

-- SOPs: who can view
drop policy if exists "Authors can view/update own drafts" on sops;
create policy "Authors can view own drafts" on sops
  for select using (
    auth.uid() = author_id
    or get_my_role() in ('super_admin', 'approver', 'team_leader')
    or (
      status = 'live'
      and exists (
        select 1 from sop_teams st
        where st.sop_id = id and has_team_access(st.team_id)
      )
    )
  );

-- SOPs: who can edit
drop policy if exists "Authors can update own SOPs" on sops;
create policy "Authors can update SOPs" on sops
  for update using (
    auth.uid() = author_id
    or get_my_role() in ('super_admin', 'approver')
  );

-- sop_teams: who can manage
drop policy if exists "Authors and super admins can manage sop_teams" on sop_teams;
create policy "Authors and super admins can manage sop_teams" on sop_teams
  for all using (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  );

-- sop_versions: who can view
drop policy if exists "Authors and admins can view versions" on sop_versions;
create policy "Authors and admins can view versions" on sop_versions
  for select using (
    get_my_role() in ('super_admin', 'approver', 'team_leader', 'junior_team_leader')
    or exists (
      select 1 from sops s
      join sop_teams st on st.sop_id = s.id
      where s.id = sop_id and has_team_access(st.team_id)
    )
  );

-- sop_versions: who can insert
drop policy if exists "System can insert versions" on sop_versions;
create policy "System can insert versions" on sop_versions
  for insert with check (
    get_my_role() in ('super_admin', 'approver', 'team_leader')
  );

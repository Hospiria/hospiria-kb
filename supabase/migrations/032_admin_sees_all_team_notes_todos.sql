-- =============================================================================
-- Migration 032 — Super admin can see all team notes and team to-dos
--
-- PROBLEM: Every note/todo SELECT policy gates team-scoped items on
-- has_team_access(team_id), which checks whether the current user is a member
-- of that specific team. A super_admin who isn't assigned to every team
-- therefore cannot see notes or to-dos that belong to other teams.
-- SOPs already have a super_admin bypass (migration 021) — this migration
-- brings notes and to-dos to the same standard.
--
-- SCOPE (intentionally limited):
--   • Team items (team_id IS NOT NULL) become fully visible to super_admin.
--   • Personal items (team_id IS NULL) remain private — admin cannot see
--     another user's personal notes or private to-do lists.
--   • Only SELECT policies are changed. Write policies are unchanged:
--     admin can view all team content but cannot edit it unless they are
--     also a team member.
--
-- Tables updated: notes, note_folders, note_sops, note_companies,
--                 todos, todo_lists, todo_sops, todo_companies, todo_assignees
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================


-- =============================================================================
-- NOTES FAMILY
-- =============================================================================

-- notes
drop policy if exists "read own or shared notes" on notes;
create policy "read own or shared notes" on notes
  for select using (
    -- Personal notes: owner or shared-with-me only (privacy preserved)
    (team_id is null and (
      owner_id = auth.uid()
      or note_shared_with_me(id)
    ))
    -- Team notes: any team member OR super_admin (new)
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- note_folders
drop policy if exists "read own or team note folders" on note_folders;
create policy "read own or team note folders" on note_folders
  for select using (
    (team_id is null and owner_id = auth.uid())
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- note_sops  (junction — access mirrors the parent note)
drop policy if exists "read accessible note sops" on note_sops;
create policy "read accessible note sops" on note_sops
  for select using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or note_shared_with_me(note_id)
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );

-- note_companies  (junction — access mirrors the parent note)
drop policy if exists "read accessible note companies" on note_companies;
create policy "read accessible note companies" on note_companies
  for select using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or note_shared_with_me(note_id)
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );


-- =============================================================================
-- TODOS FAMILY
-- =============================================================================

-- todos
drop policy if exists "read own assigned or team todos" on todos;
create policy "read own assigned or team todos" on todos
  for select using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or is_todo_assignee(id)
    -- Team todos: team member OR super_admin (new)
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- todo_lists
drop policy if exists "read own or team lists" on todo_lists;
create policy "read own or team lists" on todo_lists
  for select using (
    owner_id = auth.uid()
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- todo_sops  (junction — access mirrors the parent todo)
drop policy if exists "read accessible todo sops" on todo_sops;
create policy "read accessible todo sops" on todo_sops
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );

-- todo_companies  (junction — access mirrors the parent todo)
drop policy if exists "read accessible todo companies" on todo_companies;
create policy "read accessible todo companies" on todo_companies
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );

-- todo_assignees  (admin needs to see who is assigned to team todos they can view)
drop policy if exists "read accessible todo assignees" on todo_assignees;
create policy "read accessible todo assignees" on todo_assignees
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );

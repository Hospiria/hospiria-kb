-- =============================================================================
-- Migration 033 — Super admin full write access to all team content
--
-- PROBLEM: Migration 032 gave super_admin SELECT visibility of all team notes
-- and todos. Write policies (INSERT, UPDATE, DELETE) still gate on
-- has_team_access(), which only passes if the admin is an actual team member.
-- Additionally, comments on team todos (todo_comments) and SOP annotations
-- (sop_notes) had no super_admin bypass on SELECT either — fixed here too.
--
-- SCOPE:
--   • Super admin can read, create, edit, and delete all TEAM-scoped content:
--       notes, note_folders, note_sops, note_companies
--       todos, todo_lists, todo_assignees, todo_sops, todo_companies
--       todo_comments, sop_notes
--   • When creating items, owner_id / author_id remains auth.uid() — the admin
--     appears as the creator, so the audit trail is correct.
--   • PERSONAL items (team_id IS NULL) remain private — admin cannot read or
--     modify another user's personal notes, todos, or comments.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================


-- =============================================================================
-- NOTES — full write access to team notes
-- =============================================================================

-- INSERT: admin can create notes inside any team (attributed to themselves)
drop policy if exists "insert own notes" on notes;
create policy "insert own notes" on notes
  for insert with check (
    owner_id = auth.uid()
    and (team_id is null or has_team_access(team_id) or get_my_role() = 'super_admin')
  );

-- UPDATE: admin can edit any team note
drop policy if exists "update own or shared-editable notes" on notes;
create policy "update own or shared-editable notes" on notes
  for update using (
    (team_id is null and (
      owner_id = auth.uid()
      or note_shared_with_me(id)
    ))
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- DELETE: admin can delete any team note
drop policy if exists "delete own notes" on notes;
create policy "delete own notes" on notes
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );


-- =============================================================================
-- NOTE_FOLDERS — manage all team folders
-- =============================================================================

drop policy if exists "manage own or team note folders" on note_folders;
create policy "manage own or team note folders" on note_folders
  for all using (
    (team_id is null and owner_id = auth.uid())
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  ) with check (
    -- Normal path: user creates/edits their own folder in an accessible team
    (owner_id = auth.uid() and (
      (team_id is null)
      or has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
    -- Admin updating an existing team folder (owner_id preserved from current row)
    or (get_my_role() = 'super_admin' and team_id is not null)
  );


-- =============================================================================
-- NOTE_SOPS (junction) — manage links for all team notes
-- =============================================================================

drop policy if exists "manage accessible note sops" on note_sops;
create policy "manage accessible note sops" on note_sops
  for all using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  ) with check (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );


-- =============================================================================
-- NOTE_COMPANIES (junction) — manage links for all team notes
-- =============================================================================

drop policy if exists "manage accessible note companies" on note_companies;
create policy "manage accessible note companies" on note_companies
  for all using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  ) with check (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );


-- =============================================================================
-- TODOS — full write access to team todos
-- =============================================================================

-- INSERT: admin can create todos inside any team (attributed to themselves)
drop policy if exists "insert todos" on todos;
create policy "insert todos" on todos
  for insert with check (
    owner_id = auth.uid()
    and (team_id is null or has_team_access(team_id) or get_my_role() = 'super_admin')
  );

-- UPDATE: admin can edit any team todo (extends migration 024 policy)
drop policy if exists "update own assigned or team todos" on todos;
create policy "update own assigned or team todos" on todos
  for update using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
    or exists (select 1 from todo_assignees ta where ta.todo_id = id and ta.user_id = auth.uid())
    or (team_id is not null and get_my_role() = 'super_admin')
  );

-- DELETE: admin can delete any team todo
drop policy if exists "delete own or team todos" on todos;
create policy "delete own or team todos" on todos
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );


-- =============================================================================
-- TODO_LISTS — full write access to team lists
-- =============================================================================

-- INSERT: admin can create lists inside any team
drop policy if exists "insert own or team lists" on todo_lists;
create policy "insert own or team lists" on todo_lists
  for insert with check (
    owner_id = auth.uid()
    and (team_id is null or has_team_access(team_id) or get_my_role() = 'super_admin')
  );

-- UPDATE: admin can rename/reorder any team list
drop policy if exists "update own or team lists" on todo_lists;
create policy "update own or team lists" on todo_lists
  for update using (
    owner_id = auth.uid()
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- DELETE: admin can delete any team list
drop policy if exists "delete own or team lists" on todo_lists;
create policy "delete own or team lists" on todo_lists
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );


-- =============================================================================
-- TODO_ASSIGNEES (junction) — manage assignees for all team todos
-- =============================================================================

drop policy if exists "manage accessible todo assignees" on todo_assignees;
create policy "manage accessible todo assignees" on todo_assignees
  for all using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  ) with check (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );


-- =============================================================================
-- TODO_SOPS (junction) — manage SOP links for all team todos
-- =============================================================================

drop policy if exists "manage accessible todo sops" on todo_sops;
create policy "manage accessible todo sops" on todo_sops
  for all using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or exists (select 1 from todo_assignees ta where ta.todo_id = t.id and ta.user_id = auth.uid())
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  ) with check (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or exists (select 1 from todo_assignees ta where ta.todo_id = t.id and ta.user_id = auth.uid())
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );


-- =============================================================================
-- TODO_COMPANIES (junction) — manage company links for all team todos
-- =============================================================================

drop policy if exists "manage accessible todo companies" on todo_companies;
create policy "manage accessible todo companies" on todo_companies
  for all using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  ) with check (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
        or (t.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );


-- =============================================================================
-- TODO_COMMENTS — read, post, and manage comments on team todos
-- =============================================================================

-- SELECT: super_admin sees all comments on team todos
drop policy if exists "read todo_comments" on todo_comments;
create policy "read todo_comments" on todo_comments
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id
        and t.deleted_at is null
        and (
          t.owner_id    = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.team_id is not null and has_team_access(t.team_id))
          or (t.team_id is not null and get_my_role() = 'super_admin')
        )
    )
  );

-- INSERT: super_admin can comment on any team todo (author_id = auth.uid())
drop policy if exists "insert todo_comments" on todo_comments;
create policy "insert todo_comments" on todo_comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from todos t where t.id = todo_id
        and t.deleted_at is null
        and (
          t.owner_id    = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.team_id is not null and has_team_access(t.team_id))
          or (t.team_id is not null and get_my_role() = 'super_admin')
        )
    )
  );

-- ALL (update / delete): super_admin can manage any comment on a team todo.
-- The existing "manage own todo_comments" policy (author_id = auth.uid()) stays
-- and already covers the admin's own comments; this new policy covers others'.
drop policy if exists "super_admin manages team todo_comments" on todo_comments;
create policy "super_admin manages team todo_comments" on todo_comments
  for all using (
    get_my_role() = 'super_admin'
    and exists (
      select 1 from todos t where t.id = todo_id and t.team_id is not null
    )
  ) with check (
    get_my_role() = 'super_admin'
    and exists (
      select 1 from todos t where t.id = todo_id and t.team_id is not null
    )
  );


-- =============================================================================
-- SOP_NOTES — read, post, and manage team SOP annotations
-- =============================================================================

-- SELECT: super_admin sees all team sop_notes (personal remain private)
drop policy if exists "read sop_notes" on sop_notes;
create policy "read sop_notes" on sop_notes
  for select using (
    (team_id is null  and author_id = auth.uid())
    or (team_id is not null and (
      has_team_access(team_id)
      or get_my_role() = 'super_admin'
    ))
  );

-- INSERT: super_admin can annotate any SOP on behalf of any team
drop policy if exists "insert sop_notes" on sop_notes;
create policy "insert sop_notes" on sop_notes
  for insert with check (
    author_id = auth.uid()
    and (team_id is null or has_team_access(team_id) or get_my_role() = 'super_admin')
  );

-- ALL (update / delete): super_admin can manage any team sop_note.
-- The existing "manage own sop_notes" (author_id = auth.uid()) stays and
-- covers the admin's own annotations; this covers everyone else's.
drop policy if exists "super_admin manages team sop_notes" on sop_notes;
create policy "super_admin manages team sop_notes" on sop_notes
  for all using (
    get_my_role() = 'super_admin'
    and team_id is not null
  ) with check (
    get_my_role() = 'super_admin'
    and team_id is not null
  );

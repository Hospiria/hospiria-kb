-- =============================================================================
-- Migration 024 — Multiple assignees per to-do
--
-- Adds a todo_assignees join table so a task can be assigned to several people.
-- todos.assignee_id is kept as a denormalised "primary assignee" (= the first
-- assignee) so existing queries (dashboard, notifications, masquerade filters)
-- keep working without change.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists todo_assignees (
  todo_id uuid not null references todos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (todo_id, user_id)
);
create index if not exists todo_assignees_user_idx on todo_assignees(user_id);

-- Backfill from the existing single assignee
insert into todo_assignees (todo_id, user_id)
select id, assignee_id from todos where assignee_id is not null
on conflict do nothing;

-- ── RLS — mirror access to the parent todo ──────────────────────────────────
alter table todo_assignees enable row level security;

drop policy if exists "read accessible todo assignees" on todo_assignees;
create policy "read accessible todo assignees" on todo_assignees
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
      )
    )
  );

drop policy if exists "manage accessible todo assignees" on todo_assignees;
create policy "manage accessible todo assignees" on todo_assignees
  for all using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
      )
    )
  ) with check (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
      )
    )
  );

-- ── Extend the todos read/update policies so EVERY assignee (not just the
--    primary assignee_id) can see and update a task they're assigned to ──────
drop policy if exists "read own assigned or team todos" on todos;
create policy "read own assigned or team todos" on todos
  for select using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
    or exists (select 1 from todo_assignees ta where ta.todo_id = id and ta.user_id = auth.uid())
  );

drop policy if exists "update own assigned or team todos" on todos;
create policy "update own assigned or team todos" on todos
  for update using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
    or exists (select 1 from todo_assignees ta where ta.todo_id = id and ta.user_id = auth.uid())
  );

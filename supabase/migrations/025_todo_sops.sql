-- =============================================================================
-- Migration 025 — Link to-dos to SOPs (one or many)
--
-- A task can reference one or more SOPs so an assignee can jump straight to the
-- relevant procedure. Join table mirrors access to the parent todo.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists todo_sops (
  todo_id uuid not null references todos(id) on delete cascade,
  sop_id  uuid not null references sops(id)  on delete cascade,
  primary key (todo_id, sop_id)
);
create index if not exists todo_sops_sop_idx on todo_sops(sop_id);

alter table todo_sops enable row level security;

drop policy if exists "read accessible todo sops" on todo_sops;
create policy "read accessible todo sops" on todo_sops
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or exists (select 1 from todo_assignees ta where ta.todo_id = t.id and ta.user_id = auth.uid())
      )
    )
  );

drop policy if exists "manage accessible todo sops" on todo_sops;
create policy "manage accessible todo sops" on todo_sops
  for all using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or exists (select 1 from todo_assignees ta where ta.todo_id = t.id and ta.user_id = auth.uid())
      )
    )
  ) with check (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or exists (select 1 from todo_assignees ta where ta.todo_id = t.id and ta.user_id = auth.uid())
      )
    )
  );

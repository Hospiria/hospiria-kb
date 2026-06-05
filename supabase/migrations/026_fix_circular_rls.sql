-- =============================================================================
-- Migration 026 — Fix circular RLS between todos ↔ todo_assignees
--
-- PROBLEM: Migration 024 added a subquery on todo_assignees inside the todos
-- SELECT policy, AND a subquery on todos inside the todo_assignees SELECT policy.
-- Postgres detects this as infinite recursion and returns ZERO ROWS for both
-- tables — making all tasks disappear.
--
-- FIX: A SECURITY DEFINER function reads todo_assignees without triggering its
-- RLS, breaking the cycle. Both policies are rewritten to use it.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

-- Helper: checks if the current user is assigned to a todo via the join table.
-- SECURITY DEFINER → runs as the function owner (bypasses RLS on todo_assignees)
-- so the todos RLS can call it without triggering todo_assignees RLS.
create or replace function is_todo_assignee(todo_id_param uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from todo_assignees
    where todo_id = todo_id_param
      and user_id = auth.uid()
  )
$$;

-- ── Re-create todos policies WITHOUT circular subqueries ─────────────────────

drop policy if exists "read own assigned or team todos" on todos;
create policy "read own assigned or team todos" on todos
  for select using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
    or is_todo_assignee(id)          -- safe: bypasses todo_assignees RLS
  );

drop policy if exists "update own assigned or team todos" on todos;
create policy "update own assigned or team todos" on todos
  for update using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
    or is_todo_assignee(id)
  );

-- ── Re-create todo_assignees policy WITHOUT circular subquery ─────────────────
-- The previous policy checked todos RLS to verify access, creating the loop.
-- Instead: a user can read a row if they ARE the assignee, OR if they own /
-- are assigned to the todo (checked directly, no todos RLS involved).

drop policy if exists "read accessible todo assignees" on todo_assignees;
create policy "read accessible todo assignees" on todo_assignees
  for select using (
    user_id = auth.uid()            -- the assignee can read their own row
    or exists (                      -- owner or primary assignee can read all rows for their todo
      select 1 from todos t
      where t.id = todo_id
        and (t.owner_id = auth.uid() or t.assignee_id = auth.uid())
    )
  );

-- manage policy stays as-is (references todos.owner_id only, no loop):
-- "manage accessible todo assignees" was already safe — no change needed.

-- ── Same fix for todo_sops (migration 025 had the same pattern) ───────────────
drop policy if exists "read accessible todo sops" on todo_sops;
create policy "read accessible todo sops" on todo_sops
  for select using (
    exists (
      select 1 from todos t
      where t.id = todo_id
        and (
          t.owner_id = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.team_id is not null and has_team_access(t.team_id))
          or is_todo_assignee(todo_id)
        )
    )
  );

drop policy if exists "manage accessible todo sops" on todo_sops;
create policy "manage accessible todo sops" on todo_sops
  for all using (
    exists (
      select 1 from todos t
      where t.id = todo_id
        and (
          t.owner_id = auth.uid()
          or (t.team_id is not null and has_team_access(t.team_id))
          or is_todo_assignee(todo_id)
        )
    )
  ) with check (
    exists (
      select 1 from todos t
      where t.id = todo_id
        and (
          t.owner_id = auth.uid()
          or (t.team_id is not null and has_team_access(t.team_id))
          or is_todo_assignee(todo_id)
        )
    )
  );

-- =============================================================================
-- Migration 027 — Link to-dos to companies (one or many)
--
-- Same pattern as todo_sops (migration 025). Lets you tag a task with one or
-- more companies so the assignee knows which client it relates to.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists todo_companies (
  todo_id    uuid not null references todos(id)     on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  primary key (todo_id, company_id)
);
create index if not exists todo_companies_company_idx on todo_companies(company_id);

alter table todo_companies enable row level security;

drop policy if exists "read accessible todo companies" on todo_companies;
create policy "read accessible todo companies" on todo_companies
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
      )
    )
  );

drop policy if exists "manage accessible todo companies" on todo_companies;
create policy "manage accessible todo companies" on todo_companies
  for all using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
      )
    )
  ) with check (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or is_todo_assignee(todo_id)
      )
    )
  );

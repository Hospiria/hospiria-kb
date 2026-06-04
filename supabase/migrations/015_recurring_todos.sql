-- =============================================================================
-- Migration 015 — Recurring todos (Daily / Weekly)
--
-- Adds three columns to todos:
--   recurrence          — 'none' | 'daily' | 'weekly'
--   recurrence_parent_id— links an instance back to the template todo
--   is_carry            — true when this instance was created because the
--                         previous period's todo was not completed (DUE flag)
--
-- Templates: todos where recurrence != 'none' AND recurrence_parent_id IS NULL
-- Instances: todos where recurrence_parent_id IS NOT NULL
--
-- A cron job (api/cron/recurring-todos) runs daily and creates new instances
-- from templates, setting is_carry when the previous period's instance was
-- not done. Instances inherit team_id, assignee_id, priority from the template.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table todos
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly')),
  add column if not exists recurrence_parent_id uuid references todos(id) on delete cascade,
  add column if not exists is_carry boolean not null default false;

create index if not exists todos_recurrence_idx
  on todos(recurrence) where recurrence != 'none';

create index if not exists todos_parent_idx
  on todos(recurrence_parent_id) where recurrence_parent_id is not null;

-- Update RLS so that recurrence instances inherit their template's visibility:
-- (The existing policies already cover this via owner, assignee, and team access.)

-- =============================================================================
-- Migration 016 — Flexible recurrence schedule
--
-- Adds two columns to todos to control WHEN a recurring todo fires:
--
--   recurrence_day_of_week   — for weekly todos: 0=Sun, 1=Mon…6=Sat
--                              (null = Monday / 1 by default)
--   recurrence_weekdays_only — for daily todos: true = Mon–Fri only,
--                              false (default) = every day including weekends
--
-- The cron job (api/cron/recurring-todos) now uses these values instead of
-- hardcoding Monday for all weekly todos.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table todos
  add column if not exists recurrence_day_of_week  integer
    check (recurrence_day_of_week between 0 and 6),
  add column if not exists recurrence_weekdays_only boolean not null default false;

-- Back-fill existing weekly todos to Monday (1) so behaviour is unchanged.
update todos set recurrence_day_of_week = 1
  where recurrence = 'weekly' and recurrence_day_of_week is null;

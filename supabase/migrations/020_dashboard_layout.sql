-- =============================================================================
-- Migration 020 — Dashboard layout (card order + width)
--
-- Extends dashboard_preferences (migration 019) with a card_layout JSON blob:
--   { "order": ["tasks_today","my_notes",...],
--     "spans": { "tasks_today": 12, "my_notes": 6, ... } }
-- spans are column counts out of a 12-column grid (min 4 = one third).
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table dashboard_preferences
  add column if not exists card_layout jsonb not null default '{}'::jsonb;

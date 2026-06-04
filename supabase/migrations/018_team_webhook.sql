-- =============================================================================
-- Migration 018 — Per-team Microsoft Teams webhook URL
--
-- Adds teams_webhook_url to the teams table so each Hospiria KB team can
-- route notifications to its own Microsoft Teams channel.
-- Null = no Teams notifications for that team (falls back to the global
-- TEAMS_WEBHOOK_URL env var if set).
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table teams
  add column if not exists teams_webhook_url text;

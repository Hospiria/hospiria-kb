-- =============================================================================
-- Migration 022 — Notification settings
--
-- Gives super_admins a row-per-event control table for emails and Teams
-- notifications: on/off toggle, which roles receive it, and reminder timing.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists notification_settings (
  event           text primary key,
  -- e.g. 'quiz_assigned', 'quiz_reminder', 'sop_published', 'sop_submitted', 'sop_approved'
  label           text not null,
  description     text not null,
  email_enabled   boolean not null default true,
  teams_enabled   boolean not null default true,
  -- 'all_staff' | 'team_only' | 'specific_roles'
  recipient_scope text not null default 'team_only',
  recipient_roles jsonb not null default '[]'::jsonb,
  -- For reminder events: how many days before due date to send
  reminder_days_before int null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null
);

alter table notification_settings enable row level security;

-- Only super_admins can read or write settings
create policy "super_admin manages notification settings" on notification_settings
  for all using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- Seed with defaults that match current hard-coded behaviour
insert into notification_settings
  (event, label, description, email_enabled, teams_enabled, recipient_scope, recipient_roles, reminder_days_before)
values
  ('quiz_assigned',
   'Course assigned',
   'Sent when a SOP is published and users are enrolled in the quiz.',
   true, true, 'team_only', '["agent","junior_team_leader","team_leader"]', null),

  ('quiz_reminder',
   'Course due-date reminder',
   'Reminder sent N days before a quiz is due to users who have not completed it.',
   true, false, 'team_only', '["agent","junior_team_leader","team_leader"]', 3),

  ('sop_published',
   'SOP published',
   'Sent when a SOP goes live (no quiz). Notifies the team the document is available.',
   false, true, 'team_only', '["agent"]', null),

  ('sop_submitted',
   'SOP submitted for review',
   'Sent when an author submits a SOP. Notifies approvers to take action.',
   false, true, 'specific_roles', '["approver","team_leader"]', null),

  ('sop_approved',
   'SOP approved',
   'Sent to the author when their SOP is approved and goes live.',
   false, false, 'specific_roles', '["author"]', null)
on conflict (event) do nothing;

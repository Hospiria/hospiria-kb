-- =============================================================================
-- Migration 007 — AI Bot Training (behaviour config)
--
-- Stores the editable instructions that shape the KB chat assistant's
-- behaviour. Three sections:
--   principle  — how the bot should act (tone, rules of thumb)
--   person     — who's who in the org, so the bot can point people to the
--                right human ("Josef — manager/super-admin; escalate X to him")
--   guardrail  — conditional fallbacks ("if no SOP exists → post in the
--                WhatsApp backup chat")
--
-- The chat route (src/app/api/chat/route.ts) reads these via the service-role
-- (admin) client and composes them into the system prompt. The table is
-- therefore fully locked to super_admins — no public/authenticated read needed.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists bot_instructions (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('principle', 'person', 'guardrail')),
  content text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

create index if not exists bot_instructions_section_idx
  on bot_instructions(section, sort_order);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — super-admin only (writes happen via admin routes;
-- the chat route reads with the service-role key which bypasses RLS).
-- ---------------------------------------------------------------------------

alter table bot_instructions enable row level security;

drop policy if exists "Super admins manage bot instructions" on bot_instructions;
create policy "Super admins manage bot instructions" on bot_instructions
  for all
  using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- SEED — carry over the behaviour currently hardcoded in the chat route, so
-- moving to a DB-driven prompt doesn't regress the live bot.
-- ---------------------------------------------------------------------------

insert into bot_instructions (section, content, sort_order) values
  ('principle', 'When a question is process-specific and the user has not said which client it is for, ASK which company first before searching.', 10),
  ('principle', 'Briefly clarify intent when it changes the answer — e.g. are you helping a guest right now, or just need the process for reference? If guest-facing, offer to draft a message. Ask only the 1–2 questions that actually matter.', 20),
  ('principle', 'Always ground answers in SOP content returned by the search tool — never invent times, fees, or policies. Name the SOP(s) you used.', 30),
  ('principle', 'Be concise and practical. Short paragraphs or bullets.', 40),
  ('guardrail', 'If no relevant SOP exists for that client, say so clearly and suggest escalating to their team lead rather than guessing.', 10)
on conflict do nothing;

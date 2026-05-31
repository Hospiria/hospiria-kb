-- =============================================================================
-- Migration 006 — Chat Assistant (KB chat bot)
--
-- Stores per-user chat history for the floating knowledge-base assistant.
-- Each user only ever sees their own conversations and messages (RLS below).
-- The assistant answers from SOPs the user is allowed to see — that filtering
-- happens in application code (src/lib/sop-search.ts), mirroring the role
-- visibility rules used on the SOPs page.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb,                       -- [{ id, title }] SOPs the answer referenced
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_idx
  on chat_conversations(user_id, updated_at desc);
create index if not exists chat_messages_conversation_idx
  on chat_messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — conversations & messages are strictly private
-- ---------------------------------------------------------------------------

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

drop policy if exists "Users manage own conversations" on chat_conversations;
create policy "Users manage own conversations" on chat_conversations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users read own messages" on chat_messages;
create policy "Users read own messages" on chat_messages
  for select
  using (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users insert own messages" on chat_messages;
create policy "Users insert own messages" on chat_messages
  for insert
  with check (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users delete own messages" on chat_messages;
create policy "Users delete own messages" on chat_messages
  for delete
  using (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.user_id = auth.uid()
    )
  );

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — all messages for a conversation (RLS ensures the user owns it)
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, sources, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: data ?? [] })
}

// DELETE — remove a conversation and its messages (cascade). RLS scopes this
// to the owner, so a user can only ever delete their own conversation.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('chat_conversations').delete().eq('id', params.id)

  return NextResponse.json({ ok: true })
}

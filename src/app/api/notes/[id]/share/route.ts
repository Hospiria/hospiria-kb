import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// GET — current shares for a note (owner only, enforced by RLS).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { data } = await supabase
    .from('note_shares')
    .select('user_id, can_edit, profiles:profiles!note_shares_user_id_fkey(full_name)')
    .eq('note_id', params.id)
  return NextResponse.json({ shares: data ?? [] })
}

// POST { userId, canEdit } — share (or update share level) + notify recipient.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { userId, canEdit } = await request.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  if (userId === auth.userId) return NextResponse.json({ error: "You already own this note." }, { status: 400 })

  const { error } = await supabase
    .from('note_shares')
    .upsert({ note_id: params.id, user_id: userId, can_edit: !!canEdit }, { onConflict: 'note_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the recipient (best-effort).
  const { data: note } = await supabase.from('notes').select('title').eq('id', params.id).single()
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'note_shared',
    message: `A note was shared with you: "${(note?.title || 'Untitled note').slice(0, 80)}"`,
    link: '/notes',
  })
  return NextResponse.json({ success: true })
}

// DELETE { userId } — unshare.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { userId } = await request.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  const { error } = await supabase.from('note_shares').delete().eq('note_id', params.id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

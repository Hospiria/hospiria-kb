import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// PATCH — update a note (RLS allows owner or shared-with-edit).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title.toString().slice(0, 300)
  if (body.body !== undefined) patch.body = body.body.toString()
  if (body.color !== undefined) patch.color = body.color ? body.color.toString().slice(0, 24) : null
  if (body.pinned !== undefined) patch.pinned = !!body.pinned
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('notes').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If someone was @mentioned, notify them (best-effort, fire-and-forget).
  if (body.mentionedUserId && typeof body.mentionedUserId === 'string' && body.mentionedUserId !== auth.userId) {
    const { data: note } = await supabase.from('notes').select('title').eq('id', params.id).single()
    await supabase.from('notifications').insert({
      user_id: body.mentionedUserId,
      type: 'note_mention',
      message: `You were mentioned in a note: "${(note?.title || 'Untitled').slice(0, 80)}"`,
      link: '/notes',
    })
  }

  return NextResponse.json({ success: true })
}

// DELETE — owner only (RLS).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { error } = await supabase.from('notes').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

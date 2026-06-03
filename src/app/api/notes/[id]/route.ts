import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// PATCH — update a note (body, title, pinned, color) OR restore from trash.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const body = await request.json().catch(() => ({}))

  // Restore from trash
  if (body.restore === true) {
    const { error } = await supabase
      .from('notes')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title.toString().slice(0, 300)
  if (body.body !== undefined) patch.body = body.body.toString()
  if (body.color !== undefined) patch.color = body.color ? body.color.toString().slice(0, 24) : null
  if (body.pinned !== undefined) patch.pinned = !!body.pinned
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('notes').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify @mentioned user (best-effort)
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

// DELETE — soft-delete: sets deleted_at + deleted_by.
// If the deleter is not the owner, notify the original owner.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  // Fetch the note so we know the owner
  const { data: note } = await supabase
    .from('notes').select('owner_id, title, team_id').eq('id', params.id).single()
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  // Soft delete
  const { error } = await supabase.from('notes').update({
    deleted_at: new Date().toISOString(),
    deleted_by: auth.userId,
  }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the original owner if someone else deleted it
  if (note.owner_id !== auth.userId) {
    const { data: deleter } = await supabase
      .from('profiles').select('full_name').eq('id', auth.userId).single()
    await supabase.from('notifications').insert({
      user_id: note.owner_id,
      type: 'note_deleted',
      message: `${deleter?.full_name ?? 'A team member'} deleted your note: "${(note.title || 'Untitled').slice(0, 80)}"`,
      link: '/notes',
    })
  }

  return NextResponse.json({ success: true })
}

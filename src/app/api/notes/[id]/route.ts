import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const body = await request.json().catch(() => ({}))

  if (body.restore === true) {
    const { error } = await supabase.from('notes').update({ deleted_at: null, deleted_by: null }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title.toString().slice(0, 300)
  if (body.body !== undefined) patch.body = body.body.toString()
  if (body.content !== undefined) patch.content = body.content ?? null
  if (body.color !== undefined) patch.color = body.color ? body.color.toString().slice(0, 24) : null
  if (body.pinned !== undefined) patch.pinned = !!body.pinned
  if ('sopId' in body) patch.sop_id = body.sopId || null
  if ('folderId' in body) patch.folder_id = body.folderId || null

  const hasPatch = Object.keys(patch).length > 0
  const hasSops = Array.isArray(body.sopIds)
  const hasCompanies = Array.isArray(body.companyIds)

  if (!hasPatch && !hasSops && !hasCompanies) return NextResponse.json({ success: true })

  if (hasPatch) {
    const { error } = await supabase.from('notes').update(patch).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const db = createServiceClient()

  if (hasSops) {
    const sopIds: string[] = body.sopIds.filter(Boolean)
    await db.from('note_sops').delete().eq('note_id', params.id)
    if (sopIds.length) {
      await db.from('note_sops').insert(sopIds.map(sid => ({ note_id: params.id, sop_id: sid })))
    }
    // Keep legacy sop_id in sync (first linked SOP)
    await supabase.from('notes').update({ sop_id: sopIds[0] || null }).eq('id', params.id)
  }

  if (hasCompanies) {
    const companyIds: string[] = body.companyIds.filter(Boolean)
    await db.from('note_companies').delete().eq('note_id', params.id)
    if (companyIds.length) {
      await db.from('note_companies').insert(companyIds.map(cid => ({ note_id: params.id, company_id: cid })))
    }
  }

  // Notify @mentioned user
  if (body.mentionedUserId && typeof body.mentionedUserId === 'string' && body.mentionedUserId !== auth.userId) {
    const { data: note } = await supabase.from('notes').select('title').eq('id', params.id).single()
    await supabase.from('notifications').insert({
      user_id: body.mentionedUserId, type: 'note_mention',
      message: `You were mentioned in a note: "${(note?.title || 'Untitled').slice(0, 80)}"`, link: '/notes',
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { data: note } = await supabase.from('notes').select('owner_id, title, team_id').eq('id', params.id).single()
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  const { error } = await supabase.from('notes').update({
    deleted_at: new Date().toISOString(), deleted_by: auth.userId,
  }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (note.owner_id !== auth.userId) {
    const { data: deleter } = await supabase.from('profiles').select('full_name').eq('id', auth.userId).single()
    await supabase.from('notifications').insert({
      user_id: note.owner_id, type: 'note_deleted',
      message: `${deleter?.full_name ?? 'A team member'} deleted your note: "${(note.title || 'Untitled').slice(0, 80)}"`,
      link: '/notes',
    })
  }
  return NextResponse.json({ success: true })
}

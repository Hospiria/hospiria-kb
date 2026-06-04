import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface NoteRow {
  id: string; sop_id: string; author_id: string; team_id: string | null
  body: string; created_at: string; updated_at: string
}

// GET — notes for a SOP visible to the current user (personal own + team membership)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('sop_notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { data, error } = await supabase
    .from('sop_notes')
    .select('id, sop_id, author_id, team_id, body, created_at, updated_at')
    .eq('sop_id', params.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as NoteRow[]
  const authorIds = [...new Set(rows.map(r => r.author_id))]
  const db = createServiceClient()
  const { data: people } = authorIds.length
    ? await db.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] }
  const { data: teams } = await supabase.from('teams').select('id, name')
  const nameById = new Map((people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
  const teamById = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  const notes = rows.map(n => ({
    ...n,
    authorName: nameById.get(n.author_id) ?? 'User',
    teamName: n.team_id ? teamById.get(n.team_id) ?? null : null,
    mine: n.author_id === auth.userId,
    isTeam: !!n.team_id,
  }))
  return NextResponse.json({ notes })
}

// POST — add a note to a SOP { body, teamId? }
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('sop_notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const body = (b.body ?? '').toString().trim()
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const teamId = b.teamId || null

  const { data, error } = await supabase.from('sop_notes')
    .insert({ sop_id: params.id, author_id: auth.userId, team_id: teamId, body })
    .select('id, sop_id, author_id, team_id, body, created_at, updated_at').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  // Notify @mentioned users
  if (b.mentionedUserId && b.mentionedUserId !== auth.userId) {
    const { data: sop } = await supabase.from('sops').select('title').eq('id', params.id).single()
    await supabase.from('notifications').insert({
      user_id: b.mentionedUserId, type: 'sop_note_mention',
      message: `You were mentioned in a note on SOP: "${(sop?.title ?? 'a SOP').slice(0, 60)}"`,
      link: `/sops/${params.id}`,
    })
  }

  const db = createServiceClient()
  const { data: me } = await db.from('profiles').select('full_name').eq('id', auth.userId).single()
  return NextResponse.json({
    note: { ...data, authorName: me?.full_name ?? 'User', teamName: null, mine: true, isTeam: !!teamId },
  })
}

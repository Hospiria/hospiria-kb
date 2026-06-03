import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface NoteRow {
  id: string; owner_id: string; title: string; body: string
  color: string | null; pinned: boolean; updated_at: string; team_id: string | null
}

// GET — notes for a space.
//   ?space=personal  → notes with no team (mine + shared-with-me)
//   ?teamId=<uuid>   → notes for that team
//   (no param)       → all notes the user can see (RLS scopes)
export async function GET(request: Request) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')

  let query = supabase
    .from('notes')
    .select('id, owner_id, title, body, color, pinned, updated_at, team_id')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (space === 'personal') query = query.is('team_id', null)
  else if (teamId) query = query.eq('team_id', teamId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Which personal notes can I edit via share?
  const { data: myShares } = await supabase
    .from('note_shares')
    .select('note_id, can_edit')
    .eq('user_id', auth.userId)
  const shareMap = new Map((myShares ?? []).map(s => [s.note_id, s.can_edit]))

  const notes = ((data ?? []) as NoteRow[]).map(n => {
    const isTeamNote = !!n.team_id
    return {
      ...n,
      mine: n.owner_id === auth.userId,
      // Team notes: any member can edit. Personal: owner or explicit share.
      canEdit: isTeamNote || n.owner_id === auth.userId || shareMap.get(n.id) === true,
      shared: !isTeamNote && n.owner_id !== auth.userId,
    }
  })
  return NextResponse.json({ notes })
}

// POST — create a note.
// Body: { title, body, color?, teamId? }
export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const body = await request.json().catch(() => ({}))
  const title = (body.title ?? '').toString().slice(0, 300)
  const noteBody = (body.body ?? '').toString()
  const color = body.color ? body.color.toString().slice(0, 24) : null
  const teamId = body.teamId || null

  const { data, error } = await supabase
    .from('notes')
    .insert({ owner_id: auth.userId, title, body: noteBody, color, team_id: teamId })
    .select('id, owner_id, title, body, color, pinned, updated_at, team_id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  return NextResponse.json({ note: { ...data, mine: true, canEdit: true, shared: false } })
}

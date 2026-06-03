import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface NoteRow {
  id: string; owner_id: string; title: string; body: string
  color: string | null; pinned: boolean; updated_at: string
}

// GET — notes owned by me or shared with me (RLS scopes the rows).
export async function GET() {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { data, error } = await supabase
    .from('notes')
    .select('id, owner_id, title, body, color, pinned, updated_at')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Which shared notes can I edit?
  const { data: myShares } = await supabase
    .from('note_shares')
    .select('note_id, can_edit')
    .eq('user_id', auth.userId)
  const shareMap = new Map((myShares ?? []).map(s => [s.note_id, s.can_edit]))

  const notes = ((data ?? []) as NoteRow[]).map(n => ({
    ...n,
    mine: n.owner_id === auth.userId,
    canEdit: n.owner_id === auth.userId || shareMap.get(n.id) === true,
    shared: n.owner_id !== auth.userId,
  }))
  return NextResponse.json({ notes })
}

// POST — create a note for me.
export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const body = await request.json().catch(() => ({}))
  const title = (body.title ?? '').toString().slice(0, 300)
  const noteBody = (body.body ?? '').toString()
  const color = body.color ? body.color.toString().slice(0, 24) : null

  const { data, error } = await supabase
    .from('notes')
    .insert({ owner_id: auth.userId, title, body: noteBody, color })
    .select('id, owner_id, title, body, color, pinned, updated_at')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  return NextResponse.json({ note: { ...data, mine: true, canEdit: true, shared: false } })
}

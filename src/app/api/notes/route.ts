import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface NoteRow {
  id: string; owner_id: string; title: string; body: string
  color: string | null; pinned: boolean; updated_at: string; team_id: string | null
  sop_id: string | null; deleted_at: string | null; deleted_by: string | null
}

export async function GET(request: Request) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')
  const trash = searchParams.get('trash') === 'true'

  let query = supabase
    .from('notes')
    .select('id, owner_id, title, body, color, pinned, updated_at, team_id, sop_id, deleted_at, deleted_by')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (space === 'personal') query = query.is('team_id', null)
  else if (teamId) query = query.eq('team_id', teamId)

  // Active vs trash
  if (trash) query = query.not('deleted_at', 'is', null)
  else query = query.is('deleted_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as NoteRow[]

  // Resolve share permissions for personal notes
  const { data: myShares } = await supabase
    .from('note_shares').select('note_id, can_edit').eq('user_id', auth.userId)
  const shareMap = new Map((myShares ?? []).map(s => [s.note_id, s.can_edit]))

  // Resolve deleter names for trash view
  const deleterIds = [...new Set(rows.map(r => r.deleted_by).filter(Boolean) as string[])]
  const db = createServiceClient()
  const { data: deleters } = deleterIds.length
    ? await db.from('profiles').select('id, full_name').in('id', deleterIds)
    : { data: [] }
  const deleterById = new Map((deleters ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

  // Resolve linked SOP titles
  const sopIds = [...new Set(rows.map(r => r.sop_id).filter(Boolean) as string[])]
  const { data: sops } = sopIds.length
    ? await supabase.from('sops').select('id, title').in('id', sopIds)
    : { data: [] }
  const sopTitleById = new Map((sops ?? []).map((s: { id: string; title: string }) => [s.id, s.title]))

  const notes = rows.map(n => {
    const isTeamNote = !!n.team_id
    return {
      ...n,
      mine: n.owner_id === auth.userId,
      canEdit: isTeamNote || n.owner_id === auth.userId || shareMap.get(n.id) === true,
      shared: !isTeamNote && n.owner_id !== auth.userId,
      deletedByName: n.deleted_by ? (deleterById.get(n.deleted_by) ?? null) : null,
      sopTitle: n.sop_id ? (sopTitleById.get(n.sop_id) ?? null) : null,
    }
  })
  return NextResponse.json({ notes })
}

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
    .select('id, owner_id, title, body, color, pinned, updated_at, team_id, sop_id, deleted_at, deleted_by')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  return NextResponse.json({ note: { ...data, mine: true, canEdit: true, shared: false, deletedByName: null, sopTitle: null } })
}

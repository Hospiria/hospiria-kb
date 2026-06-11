import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { getEffectiveSession } from '@/lib/impersonation'
import { NextResponse } from 'next/server'

interface NoteRow {
  id: string; owner_id: string; title: string; body: string; content: unknown
  color: string | null; pinned: boolean; updated_at: string; team_id: string | null
  sop_id: string | null; folder_id: string | null; deleted_at: string | null; deleted_by: string | null
}

export async function GET(request: Request) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error

  const session = await getEffectiveSession()
  const isImpersonating = session?.isImpersonating ?? false
  const effectiveUserId = session?.effectiveUserId ?? auth.userId
  const supabase = isImpersonating ? createServiceClient() : createClient()

  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')
  const folderId = searchParams.get('folderId')
  const trash = searchParams.get('trash') === 'true'

  let query = supabase
    .from('notes')
    .select('id, owner_id, title, body, content, color, pinned, updated_at, team_id, sop_id, folder_id, deleted_at, deleted_by')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (space === 'personal') {
    query = query.is('team_id', null)
    if (isImpersonating) query = query.eq('owner_id', effectiveUserId)
  } else if (teamId) {
    query = query.eq('team_id', teamId)
  }
  if (folderId) query = query.eq('folder_id', folderId)
  if (trash) query = query.not('deleted_at', 'is', null)
  else query = query.is('deleted_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as NoteRow[]

  const db = createServiceClient()
  const noteIds = rows.map(r => r.id)

  // Fetch share permissions, linked SOPs, linked companies in parallel
  const allProfileIds = [...new Set([
    ...rows.map(r => r.owner_id),
    ...rows.map(r => r.deleted_by).filter(Boolean) as string[],
  ])]
  const [
    { data: myShares },
    { data: allProfiles },
    { data: sopLinks },
    { data: companyLinks },
  ] = await Promise.all([
    supabase.from('note_shares').select('note_id, can_edit').eq('user_id', effectiveUserId),
    allProfileIds.length ? db.from('profiles').select('id, full_name').in('id', allProfileIds) : Promise.resolve({ data: [] }),
    noteIds.length ? db.from('note_sops').select('note_id, sops(id, title)').in('note_id', noteIds) : Promise.resolve({ data: [] }),
    noteIds.length ? db.from('note_companies').select('note_id, companies(id, name)').in('note_id', noteIds) : Promise.resolve({ data: [] }),
  ])

  const shareMap = new Map((myShares ?? []).map(s => [s.note_id, s.can_edit]))
  const profileById = new Map((allProfiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

  // SOPs per note (join table, fallback to legacy sop_id)
  const sopsByNote = new Map<string, { id: string; title: string }[]>()
  for (const row of (sopLinks ?? []) as { note_id: string; sops: { id: string; title: string } | { id: string; title: string }[] | null }[]) {
    const sop = Array.isArray(row.sops) ? row.sops[0] : row.sops
    if (!sop) continue
    const list = sopsByNote.get(row.note_id) ?? []
    list.push({ id: sop.id, title: sop.title }); sopsByNote.set(row.note_id, list)
  }

  // Companies per note
  const companiesByNote = new Map<string, { id: string; name: string }[]>()
  for (const row of (companyLinks ?? []) as { note_id: string; companies: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const co = Array.isArray(row.companies) ? row.companies[0] : row.companies
    if (!co) continue
    const list = companiesByNote.get(row.note_id) ?? []
    list.push({ id: co.id, name: co.name }); companiesByNote.set(row.note_id, list)
  }

  // Fallback: backfill SOPs from legacy sop_id for notes not yet in note_sops
  const legacySopIds = [...new Set(rows.filter(r => r.sop_id && !sopsByNote.has(r.id)).map(r => r.sop_id as string))]
  const { data: legacySops } = legacySopIds.length
    ? await supabase.from('sops').select('id, title').in('id', legacySopIds)
    : { data: [] }
  const sopTitleById = new Map(((legacySops ?? []) as { id: string; title: string }[]).map(s => [s.id, s.title]))

  const notes = rows.map(n => {
    const isTeamNote = !!n.team_id
    const linked = sopsByNote.get(n.id) ?? (n.sop_id ? [{ id: n.sop_id, title: sopTitleById.get(n.sop_id) ?? '' }] : [])
    return {
      ...n,
      mine: n.owner_id === effectiveUserId,
      canEdit: isTeamNote || n.owner_id === effectiveUserId || shareMap.get(n.id) === true,
      shared: !isTeamNote && n.owner_id !== effectiveUserId,
      ownerName: profileById.get(n.owner_id) ?? null,
      deletedByName: n.deleted_by ? (profileById.get(n.deleted_by) ?? null) : null,
      sopTitle: linked[0]?.title ?? null,         // legacy compat
      sops: linked,
      companies: companiesByNote.get(n.id) ?? [],
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
  const content = body.content ?? null
  const color = body.color ? body.color.toString().slice(0, 24) : null
  const teamId = body.teamId || null
  const folderId = body.folderId || null

  const { data, error } = await supabase
    .from('notes')
    .insert({ owner_id: auth.userId, title, body: noteBody, content, color, team_id: teamId, folder_id: folderId })
    .select('id, owner_id, title, body, content, color, pinned, updated_at, team_id, sop_id, folder_id, deleted_at, deleted_by')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  // Record initial version (v1) — best-effort, don't fail the request
  createServiceClient().from('note_versions').insert({
    note_id: data.id, version_number: 1,
    title, body: noteBody, content: content ?? null,
    changed_by: auth.userId,
  }).then(({ error: ve }) => { if (ve) console.error('[note_versions] v1 insert:', ve.message) })

  return NextResponse.json({ note: { ...data, mine: true, canEdit: true, shared: false, deletedByName: null, sopTitle: null, sops: [], companies: [] } })
}

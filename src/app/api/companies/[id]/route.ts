import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { getEffectiveSession } from '@/lib/impersonation'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('sops', 'view')
  if ('error' in auth) return auth.error

  const session = await getEffectiveSession()
  const effectiveUserId = session?.effectiveUserId ?? auth.userId
  const supabase = createClient()
  const db = createServiceClient()

  const companyId = params.id

  // ── Company ────────────────────────────────────────────────────────────────
  const { data: company, error: coErr } = await supabase
    .from('companies')
    .select('id, name, description')
    .eq('id', companyId)
    .single()
  if (coErr || !company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── SOPs ───────────────────────────────────────────────────────────────────
  // Get SOP IDs linked to this company, then fetch the SOPs the user can see
  // (RLS on sops applies via the regular client).
  const { data: sopLinks } = await supabase
    .from('sop_companies')
    .select('sop_id')
    .eq('company_id', companyId)
  const sopIds = (sopLinks ?? []).map((r: { sop_id: string }) => r.sop_id)

  let sops: {
    id: string; title: string; status: string; category_id: string | null
    categories: { id: string; name: string } | null
  }[] = []
  if (sopIds.length > 0) {
    const { data } = await supabase
      .from('sops')
      .select('id, title, status, category_id, categories(id, name)')
      .in('id', sopIds)
      .order('title')
    sops = (data ?? []) as unknown as typeof sops
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  const { data: noteLinks } = await db
    .from('note_companies')
    .select('note_id')
    .eq('company_id', companyId)
  const noteIds = (noteLinks ?? []).map((r: { note_id: string }) => r.note_id)

  let allNotes: {
    id: string; title: string; updated_at: string
    team_id: string | null; owner_id: string; pinned: boolean
    deleted_at: string | null
    teams?: { name: string } | null
  }[] = []
  if (noteIds.length > 0) {
    // Fetch notes visible to this user — RLS (ownership / sharing / team membership) applies
    const { data } = await supabase
      .from('notes')
      .select('id, title, updated_at, team_id, owner_id, pinned, deleted_at, teams(name)')
      .in('id', noteIds)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    allNotes = (data ?? []) as unknown as typeof allNotes
  }

  // Split by personal vs team
  const teamNotes = allNotes.filter(n => n.team_id !== null)
  const myNotes   = allNotes.filter(n => n.team_id === null)

  // ── Todos ──────────────────────────────────────────────────────────────────
  const { data: todoLinks } = await db
    .from('todo_companies')
    .select('todo_id')
    .eq('company_id', companyId)
  const todoIds = (todoLinks ?? []).map((r: { todo_id: string }) => r.todo_id)

  let allTodos: {
    id: string; title: string; is_done: boolean; priority: string
    due_date: string | null; team_id: string | null; owner_id: string
    status: string; deleted_at: string | null
  }[] = []
  if (todoIds.length > 0) {
    // Use the regular client so RLS scopes to what this user can see
    const { data } = await supabase
      .from('todos')
      .select('id, title, is_done, priority, due_date, team_id, owner_id, status, deleted_at')
      .in('id', todoIds)
      .is('deleted_at', null)
      .order('is_done', { ascending: true })
      .order('due_date', { ascending: true })
    allTodos = (data ?? []) as typeof allTodos
  }

  // Fetch assignees for each todo
  let assigneesByTodo: Map<string, { id: string; full_name: string | null }[]> = new Map()
  if (todoIds.length > 0) {
    const { data: assigneeRows } = await db
      .from('todo_assignees')
      .select('todo_id, user_id')
      .in('todo_id', todoIds)
    const allAssigneeIds = [...new Set((assigneeRows ?? []).map((a: { user_id: string }) => a.user_id))]
    const { data: profiles } = allAssigneeIds.length
      ? await db.from('profiles').select('id, full_name').in('id', allAssigneeIds)
      : { data: [] }
    const nameById = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
    for (const row of (assigneeRows ?? []) as { todo_id: string; user_id: string }[]) {
      const list = assigneesByTodo.get(row.todo_id) ?? []
      list.push({ id: row.user_id, full_name: nameById.get(row.user_id) ?? null })
      assigneesByTodo.set(row.todo_id, list)
    }
  }

  // Also resolve team names
  const teamIdSet = [...new Set(allTodos.map(t => t.team_id).filter(Boolean) as string[])]
  const { data: teams } = teamIdSet.length
    ? await supabase.from('teams').select('id, name').in('id', teamIdSet)
    : { data: [] }
  const teamById = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  const todosWithMeta = allTodos.map(t => ({
    ...t,
    mine: t.owner_id === effectiveUserId,
    teamName: t.team_id ? teamById.get(t.team_id) ?? null : null,
    assignees: assigneesByTodo.get(t.id) ?? [],
  }))

  const teamTodos = todosWithMeta.filter(t => t.team_id !== null)
  const myTodos   = todosWithMeta.filter(t => t.team_id === null)

  return NextResponse.json({
    company,
    sops,
    teamNotes,
    myNotes,
    teamTodos,
    myTodos,
  })
}

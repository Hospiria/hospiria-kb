import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface TodoRow {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: 'open' | 'done'
  updated_at: string; created_at: string
  deleted_at: string | null; deleted_by: string | null
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
    .from('todos')
    .select('id, owner_id, assignee_id, team_id, title, detail, due_date, priority, status, updated_at, created_at, deleted_at, deleted_by')
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (space === 'personal') query = query.is('team_id', null)
  else if (teamId) query = query.eq('team_id', teamId)

  if (trash) query = query.not('deleted_at', 'is', null)
  else query = query.is('deleted_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as TodoRow[]

  // Resolve all referenced user IDs (owner, assignee, deleter)
  const userIds = [...new Set(rows.flatMap(t =>
    [t.owner_id, t.assignee_id, t.deleted_by].filter(Boolean) as string[]
  ))]
  const teamIds = [...new Set(rows.map(t => t.team_id).filter(Boolean) as string[])]

  const db = createServiceClient()
  const [{ data: people }, { data: teams }] = await Promise.all([
    userIds.length ? db.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
    teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] }),
  ])
  const nameById = new Map((people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
  const teamById = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  const todos = rows.map(t => ({
    ...t,
    mine: t.owner_id === auth.userId,
    assignedToMe: t.assignee_id === auth.userId,
    ownerName: nameById.get(t.owner_id) ?? null,
    assigneeName: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    teamName: t.team_id ? teamById.get(t.team_id) ?? null : null,
    deletedByName: t.deleted_by ? nameById.get(t.deleted_by) ?? null : null,
  }))
  return NextResponse.json({ todos })
}

export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const title = (b.title ?? '').toString().trim().slice(0, 300)
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const priority = ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium'
  const recurrence = ['none', 'daily', 'weekly'].includes(b.recurrence) ? b.recurrence : 'none'

  const insert = {
    owner_id: auth.userId,
    assignee_id: b.assigneeId || null,
    team_id: b.teamId || null,
    title,
    detail: b.detail ? b.detail.toString() : null,
    due_date: b.dueDate || null,
    priority,
    recurrence,
    status: b.statusName || undefined, // use provided status name if given
  }
  const { data, error } = await supabase.from('todos').insert(insert).select('*').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  if (insert.assignee_id && insert.assignee_id !== auth.userId) {
    await supabase.from('notifications').insert({
      user_id: insert.assignee_id,
      type: 'todo_assigned',
      message: `You were assigned a task: "${title.slice(0, 80)}"`,
      link: '/notes',
    })
  }
  return NextResponse.json({ todo: data })
}

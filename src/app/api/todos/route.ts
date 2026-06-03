import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface TodoRow {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: 'open' | 'done'
  updated_at: string; created_at: string
}

// GET — to-dos I own, am assigned, or that belong to a team I can access.
export async function GET() {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { data, error } = await supabase
    .from('todos')
    .select('id, owner_id, assignee_id, team_id, title, detail, due_date, priority, status, updated_at, created_at')
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as TodoRow[]
  // Resolve owner/assignee names + team names for display.
  const userIds = [...new Set(rows.flatMap(t => [t.owner_id, t.assignee_id]).filter(Boolean) as string[])]
  const teamIds = [...new Set(rows.map(t => t.team_id).filter(Boolean) as string[])]
  const [{ data: people }, { data: teams }] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
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
  }))
  return NextResponse.json({ todos })
}

// POST — create a to-do; notify the assignee if it's someone else.
export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const title = (b.title ?? '').toString().trim().slice(0, 300)
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const priority = ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium'

  const insert = {
    owner_id: auth.userId,
    assignee_id: b.assigneeId || null,
    team_id: b.teamId || null,
    title,
    detail: b.detail ? b.detail.toString() : null,
    due_date: b.dueDate || null,
    priority,
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

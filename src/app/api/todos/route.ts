import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { getEffectiveSession } from '@/lib/impersonation'
import { NextResponse } from 'next/server'
import { sendTodoNotification } from '@/lib/notifications/teams'

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

  // When masquerading as another user, use the service client (bypasses RLS)
  // and filter explicitly by the effective user's ID so we see THEIR todos,
  // not the admin's. Without this, RLS runs as the real JWT (the admin)
  // and returns the admin's own todos even while impersonating someone else.
  const session = await getEffectiveSession()
  const isImpersonating = session?.isImpersonating ?? false
  const effectiveUserId = session?.effectiveUserId ?? auth.userId
  const supabase = isImpersonating ? createServiceClient() : createClient()

  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')
  const trash = searchParams.get('trash') === 'true'

  let query = supabase
    .from('todos')
    .select('*')
    .order('is_done', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (space === 'personal') {
    query = query.is('team_id', null)
    // When masquerading, RLS won't scope to the effective user — add explicit filter
    if (isImpersonating) {
      query = query.or(`owner_id.eq.${effectiveUserId},assignee_id.eq.${effectiveUserId}`)
    }
  } else if (teamId) {
    query = query.eq('team_id', teamId)
  }

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
    mine: t.owner_id === effectiveUserId,
    assignedToMe: t.assignee_id === effectiveUserId,
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
  const recurrenceDayOfWeek = (b.recurrenceDayOfWeek != null && Number.isInteger(b.recurrenceDayOfWeek) && b.recurrenceDayOfWeek >= 0 && b.recurrenceDayOfWeek <= 6)
    ? b.recurrenceDayOfWeek : (recurrence === 'weekly' ? 1 : null)
  const recurrenceWeekdaysOnly = recurrence === 'daily' ? !!b.recurrenceWeekdaysOnly : false

  const insert: Record<string, unknown> = {
    owner_id: auth.userId,
    assignee_id: b.assigneeId || null,
    team_id: b.teamId || null,
    title,
    detail: b.detail ? b.detail.toString() : null,
    due_date: b.dueDate || null,
    priority,
    recurrence,
  }
  // Only include these if they have a non-default value — columns may not
  // exist if migration 016 hasn't been run yet.
  if (recurrenceDayOfWeek !== null) insert.recurrence_day_of_week = recurrenceDayOfWeek
  if (recurrenceWeekdaysOnly) insert.recurrence_weekdays_only = true
  if (b.statusName) insert.status = b.statusName.toString()
  const { data, error } = await supabase.from('todos').insert(insert).select('*').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  // In-app notification for the assignee
  if (insert.assignee_id && insert.assignee_id !== auth.userId) {
    await supabase.from('notifications').insert({
      user_id: insert.assignee_id,
      type: 'todo_assigned',
      message: `You were assigned a task: "${title.slice(0, 80)}"`,
      link: '/notes',
    })
  }

  // Teams channel notification for team tasks
  if (insert.team_id) {
    // Look up the team's webhook URL and resolve names (best-effort, fire-and-forget)
    const db = createServiceClient()
    const [{ data: team }, { data: creator }, { data: assignee }] = await Promise.all([
      db.from('teams').select('name, teams_webhook_url').eq('id', insert.team_id as string).single(),
      db.from('profiles').select('full_name').eq('id', auth.userId).single(),
      insert.assignee_id
        ? db.from('profiles').select('full_name').eq('id', insert.assignee_id as string).single()
        : Promise.resolve({ data: null }),
    ])

    const webhookUrl = (team as { teams_webhook_url?: string | null } | null)?.teams_webhook_url
      ?? process.env.TEAMS_WEBHOOK_URL ?? null

    if (webhookUrl) {
      sendTodoNotification({
        todoTitle: title,
        todoDetail: insert.detail as string | null,
        assigneeName: (assignee as { full_name?: string | null } | null)?.full_name ?? null,
        creatorName: (creator as { full_name?: string | null } | null)?.full_name ?? null,
        priority,
        dueDate: insert.due_date as string | null,
        recurrence,
        teamWebhookUrl: webhookUrl,
      }).catch(err => console.error('Teams todo notification error:', err))
    }
  }

  return NextResponse.json({ todo: data })
}

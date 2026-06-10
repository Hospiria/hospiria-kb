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
  list_id: string | null; position: number
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
  const listId = searchParams.get('listId')
  const trash = searchParams.get('trash') === 'true'

  // Order: open tasks first, then by manual position, then newest created first.
  // (New tasks default position 0 + newest created_at → they appear at the TOP,
  //  not pushed to the bottom by due-date sorting like before.)
  let query = supabase
    .from('todos')
    .select('*')
    .order('is_done', { ascending: true })
    .order('position', { ascending: true })
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

  if (listId) query = query.eq('list_id', listId)

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
  const todoIds = rows.map(t => t.id)
  const [{ data: teams }, { data: commentRows }, { data: assigneeRows }, { data: sopLinkRows }, { data: companyLinkRows }] = await Promise.all([
    teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] }),
    todoIds.length ? db.from('todo_comments').select('todo_id').in('todo_id', todoIds) : Promise.resolve({ data: [] }),
    todoIds.length ? db.from('todo_assignees').select('todo_id, user_id').in('todo_id', todoIds) : Promise.resolve({ data: [] }),
    todoIds.length ? db.from('todo_sops').select('todo_id, sops(id, title)').in('todo_id', todoIds) : Promise.resolve({ data: [] }),
    todoIds.length ? db.from('todo_companies').select('todo_id, companies(id, name)').in('todo_id', todoIds) : Promise.resolve({ data: [] }),
  ])

  // linked SOPs per todo
  const sopsByTodo = new Map<string, { id: string; title: string }[]>()
  for (const row of (sopLinkRows ?? []) as { todo_id: string; sops: { id: string; title: string } | { id: string; title: string }[] | null }[]) {
    const sop = Array.isArray(row.sops) ? row.sops[0] : row.sops
    if (!sop) continue
    const list = sopsByTodo.get(row.todo_id) ?? []
    list.push({ id: sop.id, title: sop.title }); sopsByTodo.set(row.todo_id, list)
  }

  // linked companies per todo
  const companiesByTodo = new Map<string, { id: string; name: string }[]>()
  for (const row of (companyLinkRows ?? []) as { todo_id: string; companies: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const co = Array.isArray(row.companies) ? row.companies[0] : row.companies
    if (!co) continue
    const list = companiesByTodo.get(row.todo_id) ?? []
    list.push({ id: co.id, name: co.name }); companiesByTodo.set(row.todo_id, list)
  }

  // assignees per todo
  const assigneesByTodo = new Map<string, string[]>()
  for (const a of (assigneeRows ?? []) as { todo_id: string; user_id: string }[]) {
    const list = assigneesByTodo.get(a.todo_id) ?? []
    list.push(a.user_id); assigneesByTodo.set(a.todo_id, list)
  }
  // Resolve names for all referenced users (owner, deleter, every assignee)
  const allUserIds = [...new Set([
    ...userIds,
    ...(assigneeRows ?? []).map((a: { user_id: string }) => a.user_id),
  ])]
  const { data: peopleRows } = allUserIds.length
    ? await db.from('profiles').select('id, full_name').in('id', allUserIds)
    : { data: [] }
  const nameById = new Map((peopleRows ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
  const teamById = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))
  const commentCount = new Map<string, number>()
  for (const c of (commentRows ?? []) as { todo_id: string }[]) {
    commentCount.set(c.todo_id, (commentCount.get(c.todo_id) ?? 0) + 1)
  }

  const todos = rows.map(t => {
    // Assignee list: join table, falling back to the legacy single assignee_id
    let assigneeIds = assigneesByTodo.get(t.id) ?? []
    if (assigneeIds.length === 0 && t.assignee_id) assigneeIds = [t.assignee_id]
    const assignees = assigneeIds.map(id => ({ id, full_name: nameById.get(id) ?? null }))
    return {
      ...t,
      mine: t.owner_id === effectiveUserId,
      assignedToMe: assigneeIds.includes(effectiveUserId),
      ownerName: nameById.get(t.owner_id) ?? null,
      assignees,
      assigneeName: assignees[0]?.full_name ?? null,
      teamName: t.team_id ? teamById.get(t.team_id) ?? null : null,
      deletedByName: t.deleted_by ? nameById.get(t.deleted_by) ?? null : null,
      commentCount: commentCount.get(t.id) ?? 0,
      sops: sopsByTodo.get(t.id) ?? [],
      companies: companiesByTodo.get(t.id) ?? [],
    }
  })
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

  // Resolve assignee list: accept assigneeIds[] (multi) or assigneeId (single, e.g. AI)
  const assigneeIds: string[] = Array.isArray(b.assigneeIds)
    ? b.assigneeIds.filter(Boolean)
    : (b.assigneeId ? [b.assigneeId] : [])

  const insert: Record<string, unknown> = {
    owner_id: auth.userId,
    assignee_id: assigneeIds[0] || null,   // denormalised primary
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
  if (b.listId) insert.list_id = b.listId
  // New tasks sort to the TOP: negative position beats the default 0 of existing rows.
  insert.position = -Date.now() % 2000000000
  const { data, error } = await supabase.from('todos').insert(insert).select('*').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  // Log a 'created' event — best-effort, fire-and-forget
  createServiceClient().from('todo_events').insert({
    todo_id: data.id, event_type: 'created', actor_id: auth.userId, new_value: title,
  }).then(({ error: ee }) => { if (ee) console.error('[todo_events] created:', ee.message) })

  // Write the full assignee set + notify each assignee
  const db2 = createServiceClient()
  if (assigneeIds.length) {
    await db2.from('todo_assignees').insert(assigneeIds.map(uid => ({ todo_id: data.id, user_id: uid }))).select()
    const others = assigneeIds.filter(uid => uid !== auth.userId)
    if (others.length) {
      await db2.from('notifications').insert(others.map(uid => ({
        user_id: uid, type: 'todo_assigned',
        message: `You were assigned a task: "${title.slice(0, 80)}"`, link: '/todos',
      })))
    }
  }

  // Link SOPs
  const sopIds: string[] = Array.isArray(b.sopIds) ? b.sopIds.filter(Boolean) : []
  if (sopIds.length) {
    await db2.from('todo_sops').insert(sopIds.map(sid => ({ todo_id: data.id, sop_id: sid })))
  }

  // Link companies
  const companyIds: string[] = Array.isArray(b.companyIds) ? b.companyIds.filter(Boolean) : []
  if (companyIds.length) {
    await db2.from('todo_companies').insert(companyIds.map(cid => ({ todo_id: data.id, company_id: cid })))
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

  return NextResponse.json({ todo: { ...data, assigneeIds, sopIds, companyIds } })
}

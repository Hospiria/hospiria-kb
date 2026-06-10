import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))

  // Restore from trash
  if (b.restore === true) {
    const { error } = await supabase.from('todos')
      .update({ deleted_at: null, deleted_by: null }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    createServiceClient().from('todo_events').insert({
      todo_id: params.id, event_type: 'restored', actor_id: auth.userId,
    }).then()
    return NextResponse.json({ success: true })
  }

  // Snapshot current state for event logging
  const { data: prePatch } = await supabase
    .from('todos')
    .select('title, status, priority, due_date, assignee_id, is_done')
    .eq('id', params.id)
    .single()

  // Multiple assignees — replace the join set and keep assignee_id as the primary
  const multiAssign = Array.isArray(b.assigneeIds)
  const assigneeIds: string[] = multiAssign ? b.assigneeIds.filter(Boolean) : []

  const patch: Record<string, unknown> = {}
  if (b.title !== undefined) patch.title = b.title.toString().trim().slice(0, 300)
  if (b.detail !== undefined) patch.detail = b.detail ? b.detail.toString() : null
  if (b.dueDate !== undefined) patch.due_date = b.dueDate || null
  if (b.priority !== undefined && ['low', 'medium', 'high'].includes(b.priority)) patch.priority = b.priority
  if (b.assigneeId !== undefined) patch.assignee_id = b.assigneeId || null
  if (multiAssign) patch.assignee_id = assigneeIds[0] || null
  if (b.teamId !== undefined) patch.team_id = b.teamId || null
  if (b.listId !== undefined) patch.list_id = b.listId || null
  if (b.status !== undefined) {
    patch.status = b.status.toString()
    if (b.isDone !== undefined) {
      patch.is_done = !!b.isDone
      patch.completed_at = b.isDone ? new Date().toISOString() : null
    }
  }
  // Only set recurrence schedule columns if explicitly provided AND non-null
  // (columns may not exist until migration 016 is run)
  if (b.recurrenceDayOfWeek !== undefined && b.recurrenceDayOfWeek !== null) patch.recurrence_day_of_week = b.recurrenceDayOfWeek
  if (b.recurrenceWeekdaysOnly !== undefined && b.recurrenceWeekdaysOnly !== false) patch.recurrence_weekdays_only = !!b.recurrenceWeekdaysOnly
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('todos').update(patch).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build audit events from the diff between pre-patch and applied patch
  if (prePatch && Object.keys(patch).length > 0) {
    type EvtRow = { todo_id: string; event_type: string; actor_id: string; old_value: string | null; new_value: string | null }
    const evts: EvtRow[] = []
    const pre = prePatch as { title: string; status: string; priority: string; due_date: string | null; assignee_id: string | null; is_done: boolean }
    if (patch.title !== undefined && patch.title !== pre.title)
      evts.push({ todo_id: params.id, event_type: 'title_changed', actor_id: auth.userId, old_value: pre.title, new_value: patch.title as string })
    if (patch.due_date !== undefined && patch.due_date !== pre.due_date)
      evts.push({ todo_id: params.id, event_type: 'due_date_changed', actor_id: auth.userId, old_value: pre.due_date, new_value: patch.due_date as string | null })
    if (patch.priority !== undefined && patch.priority !== pre.priority)
      evts.push({ todo_id: params.id, event_type: 'priority_changed', actor_id: auth.userId, old_value: pre.priority, new_value: patch.priority as string })
    if (patch.status !== undefined && patch.status !== pre.status) {
      const eventType = patch.is_done === true && !pre.is_done ? 'completed'
        : patch.is_done === false && pre.is_done ? 'uncompleted'
        : 'status_changed'
      evts.push({ todo_id: params.id, event_type: eventType, actor_id: auth.userId, old_value: pre.status, new_value: patch.status as string })
    }
    if (evts.length) {
      createServiceClient().from('todo_events').insert(evts)
        .then(({ error: ee }) => { if (ee) console.error('[todo_events] patch:', ee.message) })
    }
  }

  // Sync the assignee join table when a full list is provided
  if (multiAssign) {
    const db = createServiceClient()
    const { data: existing } = await db.from('todo_assignees').select('user_id').eq('todo_id', params.id)
    const before = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id))
    await db.from('todo_assignees').delete().eq('todo_id', params.id)
    if (assigneeIds.length) {
      await db.from('todo_assignees').insert(assigneeIds.map(uid => ({ todo_id: params.id, user_id: uid })))
    }
    // Notify newly-added assignees
    const added = assigneeIds.filter(uid => !before.has(uid) && uid !== auth.userId)
    if (added.length) {
      const { data: t } = await db.from('todos').select('title').eq('id', params.id).single()
      await db.from('notifications').insert(added.map(uid => ({
        user_id: uid, type: 'todo_assigned',
        message: `You were assigned a task: "${(t?.title || 'Task').slice(0, 80)}"`, link: '/todos',
      })))
      // Log assigned events
      db.from('todo_events').insert(added.map(uid => ({
        todo_id: params.id, event_type: 'assigned', actor_id: auth.userId,
        old_value: null, new_value: uid,
      }))).then(({ error: ee }) => { if (ee) console.error('[todo_events] assigned:', ee.message) })
    }
    // Log unassigned events
    const removed = [...before].filter(uid => !assigneeIds.includes(uid))
    if (removed.length) {
      db.from('todo_events').insert(removed.map(uid => ({
        todo_id: params.id, event_type: 'unassigned', actor_id: auth.userId,
        old_value: uid, new_value: null,
      }))).then(({ error: ee }) => { if (ee) console.error('[todo_events] unassigned:', ee.message) })
    }
  } else if (b.assigneeId !== undefined) {
    // Single-assignee path (e.g. legacy/AI): keep the join table in sync
    const db = createServiceClient()
    await db.from('todo_assignees').delete().eq('todo_id', params.id)
    if (b.assigneeId) {
      await db.from('todo_assignees').insert({ todo_id: params.id, user_id: b.assigneeId })
      if (b.assigneeId !== auth.userId) {
        const { data: t } = await db.from('todos').select('title').eq('id', params.id).single()
        await db.from('notifications').insert({
          user_id: b.assigneeId, type: 'todo_assigned',
          message: `You were assigned a task: "${(t?.title || 'Task').slice(0, 80)}"`, link: '/todos',
        })
        db.from('todo_events').insert({
          todo_id: params.id, event_type: 'assigned', actor_id: auth.userId,
          old_value: null, new_value: b.assigneeId,
        }).then(({ error: ee }) => { if (ee) console.error('[todo_events] assigned:', ee.message) })
      }
    }
  }

  // Sync linked SOPs
  if (Array.isArray(b.sopIds)) {
    const db = createServiceClient()
    const sopIds: string[] = b.sopIds.filter(Boolean)
    await db.from('todo_sops').delete().eq('todo_id', params.id)
    if (sopIds.length) {
      await db.from('todo_sops').insert(sopIds.map(sid => ({ todo_id: params.id, sop_id: sid })))
    }
  }

  // Sync linked companies
  if (Array.isArray(b.companyIds)) {
    const db = createServiceClient()
    const companyIds: string[] = b.companyIds.filter(Boolean)
    await db.from('todo_companies').delete().eq('todo_id', params.id)
    if (companyIds.length) {
      await db.from('todo_companies').insert(companyIds.map(cid => ({ todo_id: params.id, company_id: cid })))
    }
  }
  return NextResponse.json({ success: true })
}

// Soft-delete: sets deleted_at + deleted_by, notifies original owner if different.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  // Fetch the todo so we know who owns it and whether it's a team item
  const { data: todo } = await supabase
    .from('todos').select('owner_id, title, team_id').eq('id', params.id).single()
  if (!todo) return NextResponse.json({ error: 'To-do not found' }, { status: 404 })

  // RLS check: personal todos can only be deleted by owner
  if (!todo.team_id && todo.owner_id !== auth.userId) {
    return NextResponse.json({
      error: 'personal_not_owner',
      ownerName: null, // resolved client-side from ownerName field
    }, { status: 403 })
  }

  const { error } = await supabase.from('todos').update({
    deleted_at: new Date().toISOString(),
    deleted_by: auth.userId,
  }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log deleted event — best-effort
  createServiceClient().from('todo_events').insert({
    todo_id: params.id, event_type: 'deleted', actor_id: auth.userId,
  }).then(({ error: ee }) => { if (ee) console.error('[todo_events] deleted:', ee.message) })

  // Notify the original owner if someone else deleted a team todo
  if (todo.owner_id !== auth.userId) {
    const { data: deleter } = await supabase
      .from('profiles').select('full_name').eq('id', auth.userId).single()
    await supabase.from('notifications').insert({
      user_id: todo.owner_id, type: 'todo_deleted',
      message: `${deleter?.full_name ?? 'A team member'} deleted your task: "${(todo.title || 'Task').slice(0, 80)}"`,
      link: '/notes',
    })
  }

  return NextResponse.json({ success: true })
}

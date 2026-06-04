import { createClient } from '@/lib/supabase/server'
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
    return NextResponse.json({ success: true })
  }

  const patch: Record<string, unknown> = {}
  if (b.title !== undefined) patch.title = b.title.toString().trim().slice(0, 300)
  if (b.detail !== undefined) patch.detail = b.detail ? b.detail.toString() : null
  if (b.dueDate !== undefined) patch.due_date = b.dueDate || null
  if (b.priority !== undefined && ['low', 'medium', 'high'].includes(b.priority)) patch.priority = b.priority
  if (b.assigneeId !== undefined) patch.assignee_id = b.assigneeId || null
  if (b.teamId !== undefined) patch.team_id = b.teamId || null
  if (b.status !== undefined) {
    patch.status = b.status.toString()
    if (b.isDone !== undefined) {
      patch.is_done = !!b.isDone
      patch.completed_at = b.isDone ? new Date().toISOString() : null
    }
  }
  if (b.recurrenceDayOfWeek !== undefined) patch.recurrence_day_of_week = b.recurrenceDayOfWeek
  if (b.recurrenceWeekdaysOnly !== undefined) patch.recurrence_weekdays_only = !!b.recurrenceWeekdaysOnly
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('todos').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (b.assigneeId && b.assigneeId !== auth.userId) {
    const { data: t } = await supabase.from('todos').select('title').eq('id', params.id).single()
    await supabase.from('notifications').insert({
      user_id: b.assigneeId, type: 'todo_assigned',
      message: `You were assigned a task: "${(t?.title || 'Task').slice(0, 80)}"`, link: '/notes',
    })
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

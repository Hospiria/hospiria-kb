import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// PATCH — update fields / toggle status. RLS allows owner, assignee, or team.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (b.title !== undefined) patch.title = b.title.toString().trim().slice(0, 300)
  if (b.detail !== undefined) patch.detail = b.detail ? b.detail.toString() : null
  if (b.dueDate !== undefined) patch.due_date = b.dueDate || null
  if (b.priority !== undefined && ['low', 'medium', 'high'].includes(b.priority)) patch.priority = b.priority
  if (b.assigneeId !== undefined) patch.assignee_id = b.assigneeId || null
  if (b.teamId !== undefined) patch.team_id = b.teamId || null
  if (b.status !== undefined && ['open', 'done'].includes(b.status)) {
    patch.status = b.status
    patch.completed_at = b.status === 'done' ? new Date().toISOString() : null
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('todos').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If newly assigned to someone else, notify them.
  if (b.assigneeId && b.assigneeId !== auth.userId) {
    const { data: t } = await supabase.from('todos').select('title').eq('id', params.id).single()
    await supabase.from('notifications').insert({
      user_id: b.assigneeId,
      type: 'todo_assigned',
      message: `You were assigned a task: "${(t?.title || 'Task').slice(0, 80)}"`,
      link: '/notes',
    })
  }
  return NextResponse.json({ success: true })
}

// DELETE — owner or team member (RLS).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { error } = await supabase.from('todos').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

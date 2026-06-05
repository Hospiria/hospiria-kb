import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// PATCH /api/todo-lists/[id]  { name?, color?, icon?, position? }
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (b.name !== undefined) patch.name = b.name.toString().trim().slice(0, 80)
  if (b.color !== undefined) patch.color = b.color
  if (b.icon !== undefined) patch.icon = b.icon || null
  if (b.position !== undefined) patch.position = b.position
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('todo_lists').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/todo-lists/[id] — soft delete. Tasks keep existing (list_id set null via FK).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  // Detach tasks from this list so they fall back to the main views
  await supabase.from('todos').update({ list_id: null }).eq('list_id', params.id)
  const { error } = await supabase.from('todo_lists').update({ deleted_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

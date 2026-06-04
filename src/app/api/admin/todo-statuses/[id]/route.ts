import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// PATCH — update a status
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('users', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const b = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (b.name !== undefined) patch.name = b.name.toString().trim()
  if (b.color !== undefined) patch.color = b.color.toString()
  if (b.is_done !== undefined) patch.is_done = !!b.is_done
  if (b.is_default !== undefined) patch.is_default = !!b.is_default
  if (b.position !== undefined) patch.position = Number(b.position)

  // Only one can be default
  if (patch.is_default) {
    await supabase.from('todo_statuses').update({ is_default: false }).neq('id', params.id)
  }

  const { error } = await supabase.from('todo_statuses').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — remove a status (todos with this status revert to first non-done status)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('users', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  // Fetch the status name so we can migrate todos
  const { data: status } = await supabase.from('todo_statuses').select('name').eq('id', params.id).single()
  if (status) {
    const { data: fallback } = await supabase.from('todo_statuses')
      .select('name').eq('is_done', false).neq('id', params.id).order('position').limit(1).single()
    if (fallback) {
      await supabase.from('todos').update({ status: fallback.name }).eq('status', status.name)
    }
  }

  const { error } = await supabase.from('todo_statuses').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

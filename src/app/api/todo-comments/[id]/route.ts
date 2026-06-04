import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// PATCH — edit own comment
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { body } = await request.json().catch(() => ({ body: '' }))
  if (!body?.toString().trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const { error } = await supabase.from('todo_comments')
    .update({ body: body.toString().trim() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — delete own comment (RLS enforces author_id = auth.uid())
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { error } = await supabase.from('todo_comments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

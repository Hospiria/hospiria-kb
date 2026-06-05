import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const b = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (b.name !== undefined) patch.name = b.name.toString().trim().slice(0, 60)
  if (b.color !== undefined) patch.color = b.color
  if (b.icon !== undefined) patch.icon = b.icon || null
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })
  const { error } = await supabase.from('note_folders').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  // Detach notes from this folder before soft-deleting
  await supabase.from('notes').update({ folder_id: null }).eq('folder_id', params.id)
  const { error } = await supabase.from('note_folders')
    .update({ deleted_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

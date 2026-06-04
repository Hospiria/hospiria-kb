import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('sop_notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { body } = await request.json().catch(() => ({ body: '' }))
  if (!body?.toString().trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const { error } = await supabase.from('sop_notes')
    .update({ body: body.toString().trim() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('sop_notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { error } = await supabase.from('sop_notes').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

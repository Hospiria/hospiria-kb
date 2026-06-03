import { createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireFeature('sops', 'edit')
  if ('error' in auth) return auth.error
  const adminClient = createAdminClient()

  const { categoryId } = await request.json()

  const { error } = await adminClient
    .from('sops')
    .update({ category_id: categoryId ?? null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

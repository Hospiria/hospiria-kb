import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notifications', 'edit')
  if ('error' in auth) return auth.error

  const { webhookUrl } = await request.json().catch(() => ({}))
  const supabase = createClient()

  const { error } = await supabase
    .from('teams')
    .update({ teams_webhook_url: webhookUrl?.trim() || null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

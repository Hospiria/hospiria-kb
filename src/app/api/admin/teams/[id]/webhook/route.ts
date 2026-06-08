import { createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  // Gate on notifications:edit — the webhook URL is a notification delivery config.
  // We write via the service client because the teams RLS checks has_perm('teams', true),
  // not has_perm('notifications', true). Using the service client keeps the permission
  // model clean: notifications:edit governs this route, teams:edit governs team management.
  const auth = await requireFeature('notifications', 'edit')
  if ('error' in auth) return auth.error

  const { webhookUrl } = await request.json().catch(() => ({}))
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('teams')
    .update({ teams_webhook_url: webhookUrl?.trim() || null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

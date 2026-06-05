import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = await requireFeature('notifications', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .order('event')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data ?? [] })
}

export async function PATCH(request: Request) {
  const auth = await requireFeature('notifications', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const body = await request.json().catch(() => ({}))
  const { event, ...fields } = body
  if (!event) return NextResponse.json({ error: 'event is required' }, { status: 400 })

  const allowed = ['email_enabled', 'teams_enabled', 'recipient_scope', 'recipient_roles', 'reminder_days_before']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.userId }
  for (const key of allowed) {
    if (key in fields) patch[key] = fields[key]
  }

  const { error } = await supabase
    .from('notification_settings')
    .update(patch)
    .eq('event', event)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

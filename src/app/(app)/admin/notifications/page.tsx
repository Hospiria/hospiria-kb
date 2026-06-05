export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePage } from '@/lib/permissions-guard'
import { NotificationSettingsManager } from '@/components/admin/NotificationSettingsManager'

export type NotificationSetting = {
  event: string
  label: string
  description: string
  email_enabled: boolean
  teams_enabled: boolean
  recipient_scope: 'all_staff' | 'team_only' | 'specific_roles'
  recipient_roles: string[]
  reminder_days_before: number | null
  updated_at: string
}

export default async function AdminNotificationsPage() {
  await requirePage('notifications', 'view')
  const supabase = createClient()
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('*')
    .order('event')

  return <NotificationSettingsManager settings={(settings ?? []) as NotificationSetting[]} />
}

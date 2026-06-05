export const dynamic = 'force-dynamic'

import { createClient, createServiceClient } from '@/lib/supabase/server'
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

export type TeamWebhook = {
  id: string
  name: string
  teams_webhook_url: string | null
}

export default async function AdminNotificationsPage() {
  await requirePage('notifications', 'view')
  const supabase = createClient()
  const db = createServiceClient()

  // Check if migration 022 has been run
  const { data: settings, error: settingsError } = await supabase
    .from('notification_settings')
    .select('*')
    .order('event')

  // Fetch teams with their webhook URLs (service client to bypass RLS on teams)
  const { data: teams } = await db
    .from('teams')
    .select('id, name, teams_webhook_url')
    .order('name')

  // Check if SMTP is configured (env vars are server-side only)
  const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS)
  const migrationNeeded = !!settingsError || settings === null

  return (
    <NotificationSettingsManager
      settings={(settings ?? []) as NotificationSetting[]}
      teams={(teams ?? []) as TeamWebhook[]}
      smtpConfigured={smtpConfigured}
      migrationNeeded={migrationNeeded}
    />
  )
}

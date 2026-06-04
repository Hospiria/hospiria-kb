import { createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// POST { teamId } — sends a test message to that team's Teams channel.
// Lets admins verify the webhook URL is correct without needing to publish a SOP.
export async function POST(request: Request) {
  const auth = await requireFeature('users', 'edit')
  if ('error' in auth) return auth.error

  const { teamId } = await request.json().catch(() => ({}))
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const db = createAdminClient()
  const { data: team } = await db
    .from('teams')
    .select('name, teams_webhook_url')
    .eq('id', teamId)
    .single()

  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const webhookUrl = (team as { teams_webhook_url?: string | null }).teams_webhook_url?.trim()
    || process.env.TEAMS_WEBHOOK_URL?.trim()
  if (!webhookUrl) return NextResponse.json({ error: 'No webhook URL configured for this team.' }, { status: 400 })

  const body = {
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '0078D4',
    summary:    '🧪 Test from Hospiria KB',
    sections: [{
      activityTitle: '🧪 Webhook Test — Hospiria KB',
      activityText:  `This is a test notification for the **${(team as { name: string }).name}** channel. If you can read this, notifications are configured correctly! ✅`,
    }],
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const responseText = await res.text().catch(() => '')
  if (!res.ok) {
    return NextResponse.json({
      error: `Teams rejected the message (HTTP ${res.status}): ${responseText}`,
    }, { status: 500 })
  }

  return NextResponse.json({ success: true, team: (team as { name: string }).name, webhookUrl: webhookUrl.slice(0, 60) + '…' })
}

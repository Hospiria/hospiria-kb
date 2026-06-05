import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// POST /api/sops/[id]/approve — approve & publish a submitted SOP.
// Mirrors the logic in ApprovalActions so it can be triggered from the
// dashboard card without opening the full review page.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('approve_sops', 'edit')
  if ('error' in auth) return auth.error

  const sopId = params.id
  const supabase = createClient()

  const { data: sop } = await supabase
    .from('sops').select('content, current_version, status, author_id, title').eq('id', sopId).single()
  if (!sop) return NextResponse.json({ error: 'SOP not found' }, { status: 404 })
  if (sop.status !== 'submitted') return NextResponse.json({ error: 'SOP is not awaiting approval' }, { status: 409 })

  const newVersion = (sop.current_version ?? 0) + 1

  // Version snapshot
  if (sop.content) {
    await supabase.from('sop_versions').insert({
      sop_id: sopId, content: sop.content, version_number: newVersion, created_by: auth.userId,
    })
  }

  // Go live
  const { error: upErr } = await supabase.from('sops')
    .update({ status: 'live', current_version: newVersion }).eq('id', sopId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Close pending approval record
  const { data: pending } = await supabase
    .from('approvals').select('id').eq('sop_id', sopId).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).single()
  if (pending?.id) {
    await supabase.from('approvals').update({ status: 'approved', approver_id: auth.userId }).eq('id', pending.id)
  }

  // Notifications (author + team agents) via service client
  const db = createServiceClient()
  if (sop.author_id) {
    await db.from('notifications').insert({
      user_id: sop.author_id, type: 'sop_approved',
      message: `Your SOP "${sop.title}" has been approved and is now live!`, link: `/sops/${sopId}`,
    })
  }
  const { data: sopTeams } = await db.from('sop_teams').select('team_id').eq('sop_id', sopId)
  for (const { team_id } of (sopTeams ?? []) as { team_id: string }[]) {
    const { data: agents } = await db.from('profiles').select('id').eq('primary_team_id', team_id).eq('role', 'agent')
    for (const agent of (agents ?? []) as { id: string }[]) {
      await db.from('notifications').insert({
        user_id: agent.id, type: 'sop_published',
        message: `New SOP published: "${sop.title}"`, link: `/sops/${sopId}`,
      })
    }
  }

  // Full publish automation (quiz gen + enroll + email + Teams) — best-effort
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hospiria-kb.vercel.app'
  fetch(`${appUrl}/api/internal/publish-automation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sopId }),
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

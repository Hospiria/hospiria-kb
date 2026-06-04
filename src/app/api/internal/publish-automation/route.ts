export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TiptapContent, TiptapNode } from '@/types'
import { sendQuizAssignedEmail } from '@/lib/notifications/email'
import { sendTeamsNotification, sendSopPublishedNotification } from '@/lib/notifications/teams'

function tiptapToText(content: TiptapContent | null): string {
  if (!content) return ''
  function ext(node: TiptapNode): string {
    if (node.text) return node.text
    const children = node.content?.map(ext) ?? []
    switch (node.type) {
      case 'heading': return '\n## ' + children.join('') + '\n'
      case 'paragraph': return children.join('') + '\n'
      case 'listItem': return '• ' + children.join('') + '\n'
      case 'tableRow': return children.join(' | ') + '\n'
      default: return children.join('')
    }
  }
  return content.content?.map(ext).join('') ?? ''
}

export async function POST(request: Request) {
  // Triggered by the app on SOP publish — requires SOP edit rights.
  const auth = await requireFeature('sops', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { sopId, quizEnabled = true, recipientMode = 'teams', specificUserIds = [] } = body
  if (!sopId) return NextResponse.json({ error: 'Missing sopId' }, { status: 400 })

  // If quiz is disabled, just send the Teams published notification and exit early
  if (!quizEnabled) {
    const { data: sopMeta } = await adminClient
      .from('sops')
      .select('id, title, profiles(full_name), sop_teams(teams!inner(teams_webhook_url))')
      .eq('id', sopId).single()
    if (sopMeta) {
      const sopMetaAny = sopMeta as Record<string, unknown>
      const teams = (sopMetaAny.sop_teams as { teams: { teams_webhook_url: string | null }[] }[] | null) ?? []
      const seen = new Set<string>()
      const profileArr = sopMetaAny.profiles as { full_name: string | null }[] | null
      const authorName = profileArr?.[0]?.full_name ?? 'Unknown'
      for (const row of teams) {
        const arr = row.teams as { teams_webhook_url: string | null }[]
        for (const t of arr) {
          const url = t.teams_webhook_url ?? process.env.TEAMS_WEBHOOK_URL ?? null
          if (!url || seen.has(url)) continue
          seen.add(url)
        }
      }
      if (seen.size > 0) {
        for (const url of seen) {
          await sendSopPublishedNotification({ sopId, sopTitle: sopMeta.title, authorName, teamWebhookUrl: url })
        }
      } else {
        await sendSopPublishedNotification({ sopId, sopTitle: sopMeta.title, authorName })
      }
    }
    return NextResponse.json({ success: true, quizId: null, enrolled: 0, skipped: 'quiz disabled' })
  }

  // Verify SOP is actually live
  const { data: sop } = await adminClient
    .from('sops')
    .select('id, title, content, status')
    .eq('id', sopId)
    .single()

  if (!sop || sop.status !== 'live') {
    return NextResponse.json({ error: 'SOP not found or not live' }, { status: 400 })
  }

  // ── 1. Generate quiz ──────────────────────────────────────────────────
  let quizId: string | null = null

  try {
    const plainText = tiptapToText(sop.content as TiptapContent | null).trim()

    if (plainText && process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const prompt = `You are creating a training quiz for staff based on a Standard Operating Procedure titled "${sop.title}".

SOP Content:
${plainText.slice(0, 8000)}

Generate exactly 10 quiz questions:
- Questions 1–7: multiple choice with exactly 4 options (one correct)
- Questions 8–10: true/false

Return ONLY a valid JSON array with no other text or explanation:
[
  {
    "id": "q1",
    "type": "multiple_choice",
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct": 0
  },
  {
    "id": "q8",
    "type": "true_false",
    "question": "...",
    "options": ["True", "False"],
    "correct": 0
  }
]

Rules:
- "correct" is the 0-based index of the correct answer
- All questions must test understanding of this specific SOP content
- Vary difficulty: some recall, some comprehension
- Questions must be clear and unambiguous`

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)

      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0])
        const { data: quiz } = await adminClient
          .from('quizzes')
          .upsert({ sop_id: sopId, title: sop.title, questions, pass_mark: 80, status: 'active' }, { onConflict: 'sop_id' })
          .select('id')
          .single()
        quizId = quiz?.id ?? null
      }
    } else {
      // No AI key — just create quiz placeholder
      const { data: quiz } = await adminClient
        .from('quizzes')
        .upsert({ sop_id: sopId, title: sop.title, questions: [], pass_mark: 80, status: 'active' }, { onConflict: 'sop_id' })
        .select('id')
        .single()
      quizId = quiz?.id ?? null
    }
  } catch (err) {
    console.error('Quiz generation error:', err)
    // Don't fail the whole automation if quiz gen fails — enrollment and notifications still go out
  }

  if (!quizId) {
    // Fetch existing quiz for this SOP if upsert didn't return it
    const { data: existing } = await adminClient.from('quizzes').select('id').eq('sop_id', sopId).single()
    quizId = existing?.id ?? null
  }

  // ── 2. Determine recipients ───────────────────────────────────────────
  const { data: { users: rawAuthUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map(rawAuthUsers.map(u => [u.id, { email: u.email ?? '', name: u.user_metadata?.full_name ?? '' }]))

  let allProfiles: { id: string; full_name: string | null; role: string }[] = []

  if (recipientMode === 'specific' && Array.isArray(specificUserIds) && specificUserIds.length > 0) {
    // Specific people selected on the SOP form
    const { data: specificProfiles } = await adminClient
      .from('profiles')
      .select('id, full_name, role')
      .in('id', specificUserIds as string[])
    allProfiles = (specificProfiles ?? []) as { id: string; full_name: string | null; role: string }[]
  } else {
    // Default: enroll everyone in the SOP's audience teams
    const { data: sopTeams } = await adminClient
      .from('sop_teams')
      .select('team_id')
      .eq('sop_id', sopId)

    const teamIds = (sopTeams ?? []).map((t: { team_id: string }) => t.team_id)

    if (teamIds.length === 0) {
      // No teams assigned — enroll everyone
      const { data: profiles } = await adminClient.from('profiles').select('id, full_name, role')
      allProfiles = (profiles ?? []) as { id: string; full_name: string | null; role: string }[]
    } else {
      const { data: primaryMembers } = await adminClient
        .from('profiles')
        .select('id, full_name, role')
        .in('primary_team_id', teamIds)

      const { data: accessMembers } = await adminClient
        .from('team_access')
        .select('user_id, profiles(id, full_name, role)')
        .in('team_id', teamIds)

      const accessProfiles = (accessMembers ?? [])
        .flatMap((a: { user_id: string; profiles: { id: string; full_name: string | null; role: string }[] }) => a.profiles ?? [])
        .filter(Boolean) as { id: string; full_name: string | null; role: string }[]

      const seen = new Set<string>()
      for (const p of [...(primaryMembers ?? []), ...accessProfiles]) {
        if (!seen.has(p.id)) { seen.add(p.id); allProfiles.push(p) }
      }

      // Always include super_admins
      const { data: admins } = await adminClient
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'super_admin')
      for (const a of (admins ?? [])) {
        if (!seen.has(a.id)) { seen.add(a.id); allProfiles.push(a) }
      }
    }
  }

  // ── 3. Enroll everyone in the quiz (7-day deadline) ──────────────────
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7)

  if (quizId) {
    // Skip anyone already enrolled
    const { data: existingEnrollments } = await adminClient
      .from('quiz_enrollments')
      .select('user_id')
      .eq('quiz_id', quizId)
    const alreadyEnrolled = new Set((existingEnrollments ?? []).map((e: { user_id: string }) => e.user_id))

    const newEnrollments = allProfiles
      .filter(p => !alreadyEnrolled.has(p.id))
      .map(p => ({
        quiz_id: quizId,
        user_id: p.id,
        enrolled_by: user.id,
        due_date: dueDate.toISOString(),
        status: 'pending',
      }))

    if (newEnrollments.length > 0) {
      await adminClient.from('quiz_enrollments').insert(newEnrollments)
    }

    // ── 4. In-app notifications for all users ────────────────────────
    const inAppNotifications = allProfiles.map(p => ({
      user_id: p.id,
      type: 'quiz_enrolled',
      message: `New course assigned: "${sop.title}". Due in 7 days — complete your quiz before ${dueDate.toLocaleDateString('en-GB')}.`,
      link: `/quizzes`,
    }))
    if (inAppNotifications.length > 0) {
      await adminClient.from('notifications').insert(inAppNotifications)
    }

    // ── 5. Send emails to all users ──────────────────────────────────
    for (const p of allProfiles) {
      const auth = emailMap.get(p.id)
      if (auth?.email) {
        await sendQuizAssignedEmail({
          to: auth.email,
          name: p.full_name ?? auth.name ?? 'there',
          sopTitle: sop.title,
          dueDate,
        })
      }
    }
  }

  // ── 6. Send Teams notifications — one per audience team ──────────────
  // Fetch the audience teams for this SOP, with their webhook URLs.
  const { data: sopTeamRows } = await adminClient
    .from('sop_teams')
    .select('teams!inner(id, name, teams_webhook_url)')
    .eq('sop_id', sopId)

  const audienceTeams = (sopTeamRows ?? []).flatMap(
    (r: { teams: { id: string; name: string; teams_webhook_url: string | null }[] }) => r.teams
  )

  if (audienceTeams.length === 0) {
    // No specific audience — send to the global webhook
    if (quizEnabled) {
      await sendTeamsNotification({ sopTitle: sop.title, dueDate })
    } else {
      await sendSopPublishedNotification({
        sopId, sopTitle: sop.title,
        authorName: (sop as { profiles?: { full_name: string | null } }).profiles?.full_name ?? 'Unknown',
      })
    }
  } else {
    // Send to each team's channel (deduped by webhook URL)
    const seen = new Set<string>()
    const authorName = (sop as { profiles?: { full_name: string | null } }).profiles?.full_name ?? 'Unknown'
    for (const team of audienceTeams) {
      const url = team.teams_webhook_url ?? process.env.TEAMS_WEBHOOK_URL ?? null
      if (!url || seen.has(url)) continue
      seen.add(url)
      if (quizEnabled) {
        await sendTeamsNotification({ sopTitle: sop.title, dueDate, teamWebhookUrl: url })
      } else {
        await sendSopPublishedNotification({ sopId, sopTitle: sop.title, authorName, teamWebhookUrl: url })
      }
    }
  }

  return NextResponse.json({ success: true, quizId, enrolled: allProfiles.length })
}

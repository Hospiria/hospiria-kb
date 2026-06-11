export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TiptapContent, TiptapNode } from '@/types'
import { sendQuizAssignedEmail } from '@/lib/notifications/email'
import { sendTeamsNotification, sendSopPublishedNotification } from '@/lib/notifications/teams'

// Fetch webhook URLs for a list of team IDs, deduped, non-empty only.
async function getTeamWebhooks(
  db: ReturnType<typeof createAdminClient>,
  teamIds: string[]
): Promise<string[]> {
  if (!teamIds.length) return []
  const { data } = await db
    .from('teams')
    .select('teams_webhook_url')
    .in('id', teamIds)
  const seen = new Set<string>()
  for (const row of (data ?? []) as { teams_webhook_url: string | null }[]) {
    const url = row.teams_webhook_url?.trim() || process.env.TEAMS_WEBHOOK_URL?.trim() || null
    if (url && !seen.has(url)) seen.add(url)
  }
  return [...seen]
}

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

  // Read notification settings so admin toggles are respected
  const { data: notifSettings } = await adminClient
    .from('notification_settings')
    .select('event, email_enabled, teams_enabled')
    .in('event', ['quiz_assigned', 'sop_published'])
  const settingFor = (evt: string) => notifSettings?.find(s => s.event === evt)
  const quizEmailEnabled  = settingFor('quiz_assigned')?.email_enabled  ?? true
  const quizTeamsEnabled  = settingFor('quiz_assigned')?.teams_enabled  ?? true
  const sopTeamsEnabled   = settingFor('sop_published')?.teams_enabled  ?? true

  // If quiz is disabled, just send the Teams published notification and exit early
  if (!quizEnabled) {
    const [{ data: sopMeta }, { data: teamRows }] = await Promise.all([
      adminClient.from('sops').select('id, title, author_id').eq('id', sopId).single(),
      adminClient.from('sop_teams').select('team_id').eq('sop_id', sopId),
    ])
    if (sopMeta) {
      // Resolve author name and team webhook URLs separately (avoids nested-join type issues)
      const { data: author } = await adminClient.from('profiles').select('full_name').eq('id', sopMeta.author_id).single()
      const authorName = (author as { full_name?: string | null } | null)?.full_name ?? 'Unknown'
      const teamIds = (teamRows ?? []).map((r: { team_id: string }) => r.team_id)
      const webhookUrls = await getTeamWebhooks(adminClient, teamIds)
      if (sopTeamsEnabled) {
        if (webhookUrls.length > 0) {
          for (const url of webhookUrls) {
            await sendSopPublishedNotification({ sopId, sopTitle: sopMeta.title, authorName, teamWebhookUrl: url })
          }
        } else {
          await sendSopPublishedNotification({ sopId, sopTitle: sopMeta.title, authorName })
        }
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
      // Enroll only users whose primary team is in the SOP's assigned teams.
      // team_access grants SOP viewing rights — it does NOT mean the person should
      // take the quiz, so we intentionally exclude it here.
      const { data: primaryMembers } = await adminClient
        .from('profiles')
        .select('id, full_name, role')
        .in('primary_team_id', teamIds)
      allProfiles = (primaryMembers ?? []) as { id: string; full_name: string | null; role: string }[]
    }
  }

  // Admins and approvers manage courses — they don't take them.
  // Filter them out so they are not enrolled and don't receive quiz emails.
  const LEARNER_ROLES = ['agent', 'team_leader', 'junior_team_leader']
  const learnerProfiles = allProfiles.filter(p => LEARNER_ROLES.includes(p.role))

  // ── 3. Enroll learners in the quiz (7-day deadline) ───────────────────
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7)

  if (quizId) {
    // Skip anyone already enrolled
    const { data: existingEnrollments } = await adminClient
      .from('quiz_enrollments')
      .select('user_id')
      .eq('quiz_id', quizId)
    const alreadyEnrolled = new Set((existingEnrollments ?? []).map((e: { user_id: string }) => e.user_id))

    const newEnrollments = learnerProfiles
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

    // ── 4. In-app notifications for learners only ────────────────────
    const inAppNotifications = learnerProfiles.map(p => ({
      user_id: p.id,
      type: 'quiz_enrolled',
      message: `New course assigned: "${sop.title}". Due in 7 days — complete your quiz before ${dueDate.toLocaleDateString('en-GB')}.`,
      link: `/quizzes`,
    }))
    if (inAppNotifications.length > 0) {
      await adminClient.from('notifications').insert(inAppNotifications)
    }

    // ── 5. Send emails to learners only (gated by notification settings) ─
    if (quizEmailEnabled) {
      for (const p of learnerProfiles) {
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
  }

  // ── 6. Send Teams notifications (gated by notification settings) ──────
  const { data: sopTeamRows2 } = await adminClient
    .from('sop_teams').select('team_id').eq('sop_id', sopId)
  const sopTeamIds = (sopTeamRows2 ?? []).map((r: { team_id: string }) => r.team_id)
  const webhookUrls = await getTeamWebhooks(adminClient, sopTeamIds)
  const authorName2 = (sop as { profiles?: { full_name: string | null } }).profiles?.full_name ?? 'Unknown'

  const shouldTeams = quizEnabled ? quizTeamsEnabled : sopTeamsEnabled
  if (shouldTeams) {
    if (webhookUrls.length === 0) {
      if (quizEnabled) {
        await sendTeamsNotification({ sopTitle: sop.title, dueDate })
      } else {
        await sendSopPublishedNotification({ sopId, sopTitle: sop.title, authorName: authorName2 })
      }
    } else {
      for (const url of webhookUrls) {
        if (quizEnabled) {
          await sendTeamsNotification({ sopTitle: sop.title, dueDate, teamWebhookUrl: url })
        } else {
          await sendSopPublishedNotification({ sopId, sopTitle: sop.title, authorName: authorName2, teamWebhookUrl: url })
        }
      }
    }
  }

  return NextResponse.json({ success: true, quizId, enrolled: learnerProfiles.length })
}

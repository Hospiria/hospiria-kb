export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TiptapContent, TiptapNode } from '@/types'
import { sendQuizAssignedEmail } from '@/lib/notifications/email'
import { sendTeamsNotification } from '@/lib/notifications/teams'

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
  // Requires authenticated user (any role) — automation is triggered by the app itself
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sopId } = await request.json()
  if (!sopId) return NextResponse.json({ error: 'Missing sopId' }, { status: 400 })

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

  // ── 2. Get all users + their emails ──────────────────────────────────
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, full_name, role')

  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map(authUsers.map(u => [u.id, { email: u.email ?? '', name: u.user_metadata?.full_name ?? '' }]))

  const allProfiles = (profiles ?? []) as { id: string; full_name: string | null; role: string }[]

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

  // ── 6. Send Teams notification ────────────────────────────────────────
  await sendTeamsNotification({ sopTitle: sop.title, dueDate })

  return NextResponse.json({ success: true, quizId, enrolled: allProfiles.length })
}

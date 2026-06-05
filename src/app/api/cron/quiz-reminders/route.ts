export const maxDuration = 60

import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendQuizReminderEmail } from '@/lib/notifications/email'

export async function GET(request: Request) {
  // Verify this is called by Vercel Cron (or manually with the secret)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  // Read notification settings for quiz_reminder
  const { data: settingsRow } = await adminClient
    .from('notification_settings')
    .select('email_enabled, teams_enabled, reminder_days_before')
    .eq('event', 'quiz_reminder')
    .single()
  const emailEnabled = settingsRow?.email_enabled ?? true
  const reminderDays = settingsRow?.reminder_days_before ?? 3

  // Find enrollments due in the reminder window (reminder_days_before to +1 day after)
  const now = new Date()
  const reminderWindowStart = new Date(now)
  reminderWindowStart.setDate(now.getDate() + reminderDays)
  const reminderWindowEnd = new Date(now)
  reminderWindowEnd.setDate(now.getDate() + 4)

  const { data: enrollments } = await adminClient
    .from('quiz_enrollments')
    .select(`
      id,
      user_id,
      due_date,
      quiz_id,
      quizzes(title, sop_id)
    `)
    .eq('status', 'pending')
    .gte('due_date', reminderWindowStart.toISOString())
    .lte('due_date', reminderWindowEnd.toISOString())

  if (!enrollments?.length) {
    return NextResponse.json({ reminded: 0, message: 'No reminders needed today' })
  }

  // Get all auth users for emails
  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map(authUsers.map(u => [u.id, u.email ?? '']))

  // Get profiles for names
  const userIds = enrollments.map(e => e.user_id)
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  const nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? 'there']))

  // Check which users already received a reminder for this quiz
  const { data: existingReminders } = await adminClient
    .from('notifications')
    .select('user_id, link')
    .eq('type', 'quiz_reminder')
    .in('user_id', userIds)

  const remindedSet = new Set((existingReminders ?? []).map((r: { user_id: string; link: string }) => `${r.user_id}::${r.link}`))

  let reminded = 0

  for (const enrollment of enrollments) {
    const quizRaw = enrollment.quizzes
    const quiz = (Array.isArray(quizRaw) ? quizRaw[0] : quizRaw) as { title: string; sop_id: string } | null
    if (!quiz) continue

    const reminderKey = `${enrollment.user_id}::/quizzes`
    if (remindedSet.has(reminderKey)) continue // Already reminded

    const dueDate = new Date(enrollment.due_date)
    const email = emailMap.get(enrollment.user_id)
    const name = nameMap.get(enrollment.user_id) ?? 'there'

    // In-app notification
    await adminClient.from('notifications').insert({
      user_id: enrollment.user_id,
      type: 'quiz_reminder',
      message: `⏰ Reminder: Your course "${quiz.title}" is due in 3 days. Complete it now!`,
      link: `/quizzes`,
    })

    // Email reminder — only if enabled in notification settings
    if (emailEnabled && email) {
      await sendQuizReminderEmail({
        to: email,
        name,
        sopTitle: quiz.title,
        dueDate,
      })
    }

    reminded++
  }

  return NextResponse.json({ reminded })
}

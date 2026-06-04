export const maxDuration = 60

import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Runs daily at 06:00 UTC via Vercel cron.
// For each recurring todo template:
//   - Daily  → creates a new instance every day if none exists for today.
//   - Weekly → creates a new instance every Monday if none exists for this week.
// If the previous period's instance was NOT done, the new instance gets
// is_carry = true (shows as DUE in the UI).
export async function GET(request: Request) {
  const secret = request.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)         // YYYY-MM-DD
  const dayOfWeek = now.getDay()                          // 0=Sun, 1=Mon…
  const isMonday = dayOfWeek === 1

  // Monday of the current week (for weekly grouping).
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const mondayStr = monday.toISOString().slice(0, 10)

  // Fetch all active recurring templates (no parent, not deleted).
  const { data: templates, error } = await db
    .from('todos')
    .select('*')
    .neq('recurrence', 'none')
    .is('recurrence_parent_id', null)
    .is('deleted_at', null)

  if (error) {
    console.error('recurring-todos cron error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let created = 0
  const results: string[] = []

  for (const template of (templates ?? [])) {
    const isWeekly = template.recurrence === 'weekly'

    // Determine the period start date for this recurrence type.
    const periodStart = isWeekly ? mondayStr : todayStr

    // Skip weekly todos if today is not Monday.
    if (isWeekly && !isMonday) continue

    // Check if an instance already exists for this period.
    const { data: existing } = await db
      .from('todos')
      .select('id')
      .eq('recurrence_parent_id', template.id)
      .gte('created_at', `${periodStart}T00:00:00Z`)
      .limit(1)

    if (existing && existing.length > 0) continue   // already created for this period

    // Find the most recent previous instance to determine carry status.
    const { data: prev } = await db
      .from('todos')
      .select('id, is_done, status')
      .eq('recurrence_parent_id', template.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    // Also check if the template itself is "the previous instance" (first recurrence).
    const prevIsDone = prev?.length
      ? prev[0].is_done
      : template.is_done   // template acts as the first instance

    const isCarry = !prevIsDone   // carry = previous wasn't completed

    // Determine due date.
    const dueDate = isWeekly
      ? new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)  // Sunday
      : todayStr

    // Default status: find the default status name.
    const { data: defaultStatus } = await db
      .from('todo_statuses')
      .select('name')
      .eq('is_default', true)
      .limit(1)
      .single()
    const statusName = defaultStatus?.name ?? 'To Do'

    const { error: insErr } = await db.from('todos').insert({
      owner_id: template.owner_id,
      assignee_id: template.assignee_id,
      team_id: template.team_id,
      title: template.title,
      detail: template.detail,
      priority: template.priority,
      recurrence: template.recurrence,
      recurrence_parent_id: template.id,
      is_carry: isCarry,
      due_date: dueDate,
      status: statusName,
      is_done: false,
    })

    if (insErr) {
      results.push(`❌ ${template.title}: ${insErr.message}`)
    } else {
      created++
      results.push(`✅ ${template.title} (${template.recurrence}${isCarry ? ' — CARRY' : ''})`)
    }
  }

  return NextResponse.json({ created, results })
}

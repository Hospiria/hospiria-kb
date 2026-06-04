export const maxDuration = 60

import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Runs daily at 06:00 UTC via Vercel cron.
// Creates new instances for each recurring template when its scheduled period starts.
//   - Daily: every day (or Mon–Fri only if recurrence_weekdays_only = true)
//   - Weekly: on the configured day of week (recurrence_day_of_week, default 1 = Mon)
// If the previous period's instance was NOT done, the new one gets is_carry = true (DUE flag).
export async function GET(request: Request) {
  const secret = request.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const dayOfWeek = now.getDay()  // 0=Sun, 1=Mon…6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  // Compute start-of-week for the configured weekday.
  // Returns the most-recent occurrence of `targetDay` (0-6) at or before today.
  function startOfCurrentWeek(targetDay: number): string {
    const d = new Date(now)
    let offset = dayOfWeek - targetDay
    if (offset < 0) offset += 7          // went back into last week
    d.setDate(now.getDate() - offset)
    return d.toISOString().slice(0, 10)
  }

  // Fetch all active recurring templates.
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
    const isDaily  = template.recurrence === 'daily'

    // --- Daily: skip weekends if weekdays_only is set ---
    if (isDaily && template.recurrence_weekdays_only && isWeekend) continue

    // --- Weekly: only run on the configured day (default Monday = 1) ---
    const configuredDay: number = template.recurrence_day_of_week ?? 1
    if (isWeekly && dayOfWeek !== configuredDay) continue

    // Period start: for weekly = start of this week relative to configured day;
    // for daily = today.
    const periodStart = isWeekly ? startOfCurrentWeek(configuredDay) : todayStr

    // Skip if an instance already exists for this period.
    const { data: existing } = await db
      .from('todos')
      .select('id')
      .eq('recurrence_parent_id', template.id)
      .gte('created_at', `${periodStart}T00:00:00Z`)
      .limit(1)

    if (existing && existing.length > 0) continue

    // Find most recent previous instance to determine carry status.
    const { data: prev } = await db
      .from('todos')
      .select('id, is_done')
      .eq('recurrence_parent_id', template.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    const prevIsDone = prev?.length ? prev[0].is_done : template.is_done
    const isCarry = !prevIsDone

    // Due date: end of current period.
    let dueDate = todayStr
    if (isWeekly) {
      const end = new Date(now)
      const toEndOfWeek = (configuredDay + 6) % 7 - (dayOfWeek - configuredDay)
      end.setDate(now.getDate() + ((configuredDay + 6 - dayOfWeek) % 7))
      dueDate = end.toISOString().slice(0, 10)
    }

    const { data: defaultStatus } = await db
      .from('todo_statuses').select('name').eq('is_default', true).limit(1).single()
    const statusName = defaultStatus?.name ?? 'To Do'

    const { error: insErr } = await db.from('todos').insert({
      owner_id:                   template.owner_id,
      assignee_id:                template.assignee_id,
      team_id:                    template.team_id,
      title:                      template.title,
      detail:                     template.detail,
      priority:                   template.priority,
      recurrence:                 template.recurrence,
      recurrence_parent_id:       template.id,
      recurrence_day_of_week:     template.recurrence_day_of_week,
      recurrence_weekdays_only:   template.recurrence_weekdays_only,
      is_carry:                   isCarry,
      due_date:                   dueDate,
      status:                     statusName,
      is_done:                    false,
    })

    if (insErr) results.push(`❌ ${template.title}: ${insErr.message}`)
    else { created++; results.push(`✅ ${template.title} (${template.recurrence}${isCarry ? ' — CARRY' : ''})`) }
  }

  return NextResponse.json({ created, results })
}

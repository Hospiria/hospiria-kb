export const maxDuration = 30

import { createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

interface ParsedTodo {
  title: string
  detail: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  assigneeName: string | null
  recurrence: 'none' | 'daily' | 'weekly'
  statusName: string | null
}

function parseJsonObject<T>(text: string): T | null {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}')
  if (a === -1 || b === -1) return null
  try { return JSON.parse(text.slice(a, b + 1)) as T } catch { return null }
}

export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 500 })
  }

  const { text } = await request.json().catch(() => ({}))
  if (!text || text.toString().trim().length < 2) {
    return NextResponse.json({ error: 'Type what you need to do.' }, { status: 400 })
  }

  const db = createServiceClient()
  const [{ data: peopleRows }, { data: statusRows }] = await Promise.all([
    db.from('profiles').select('id, full_name').order('full_name'),
    db.from('todo_statuses').select('id, name, is_done').order('position'),
  ])
  const people = (peopleRows ?? []) as { id: string; full_name: string | null }[]
  const statuses = (statusRows ?? []) as { id: string; name: string; is_done: boolean }[]
  const peopleList = people.map(p => p.full_name).filter(Boolean).join(', ') || '(none)'
  const statusList = statuses.map(s => s.name).join(', ') || 'To Do, In Progress, Completed'
  const today = new Date().toISOString().slice(0, 10)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let parsed: ParsedTodo | null = null
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: `You convert a short note into a structured to-do for a property-management team.
Today is ${today}.

Rules:
- Resolve relative dates ("tomorrow", "next Tuesday", "Monday") to YYYY-MM-DD.
- Known assignees: ${peopleList}. Only set assigneeName if clearly named.
- Priority: "urgent"/"asap" → high; "whenever"/"low priority" → low; else medium.
- Recurrence: "every day"/"daily"/"each morning" → "daily"; "every week"/"every Monday"/"weekly" → "weekly"; else "none".
- Status: choose the closest match from [${statusList}] if the text implies one ("in progress", "blocked", "done", etc.). Else null.
- Due date for weekly recurrences: set to next Monday if no other date given.
- Due date for daily recurrences: set to today if no other date given.

Respond with ONLY this JSON, no prose:
{"title":"short imperative task","detail":"extra context or null","due_date":"YYYY-MM-DD or null","priority":"low|medium|high","assigneeName":"exact name or null","recurrence":"none|daily|weekly","statusName":"exact status name or null"}`,
      messages: [{ role: 'user', content: text.toString() }],
    })
    const out = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
    parsed = parseJsonObject<ParsedTodo>(out)
  } catch (err) {
    console.error('todo ai error', err)
    return NextResponse.json({ error: 'Could not understand that — try rephrasing.' }, { status: 500 })
  }
  if (!parsed?.title) return NextResponse.json({ error: 'Could not understand that — try rephrasing.' }, { status: 500 })

  // Map assignee name → id
  let assigneeId: string | null = null
  if (parsed.assigneeName) {
    const match = people.find(p => (p.full_name ?? '').toLowerCase() === parsed!.assigneeName!.toLowerCase())
      ?? people.find(p => (p.full_name ?? '').toLowerCase().includes(parsed!.assigneeName!.toLowerCase()))
    assigneeId = match?.id ?? null
  }

  // Resolve status name → confirm it exists, else null
  const validStatus = parsed.statusName
    ? (statuses.find(s => s.name.toLowerCase() === parsed!.statusName!.toLowerCase())?.name ?? null)
    : null

  const recurrence = ['none', 'daily', 'weekly'].includes(parsed.recurrence ?? '') ? parsed.recurrence : 'none'

  return NextResponse.json({
    draft: {
      title: parsed.title.slice(0, 300),
      detail: parsed.detail ?? null,
      dueDate: parsed.due_date ?? null,
      priority: ['low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : 'medium',
      assigneeId,
      assigneeName: assigneeId ? parsed.assigneeName : null,
      recurrence,
      statusName: validStatus,
    },
  })
}

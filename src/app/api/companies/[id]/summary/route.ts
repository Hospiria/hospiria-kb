export const maxDuration = 60

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import Anthropic from '@anthropic-ai/sdk'

// POST /api/companies/[id]/summary
// Streams an AI summary of this month's activity for a company:
// notes created/updated, tasks completed, new SOPs.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('sops', 'view')
  if ('error' in auth) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('AI is not configured (missing API key).', { status: 500 })
  }

  const supabase = createClient()
  const db = createServiceClient()
  const companyId = params.id

  // Date range: start of current month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // ── Company ────────────────────────────────────────────────────────────────
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single()
  if (!company) return new Response('Company not found', { status: 404 })

  // ── SOPs for this company (new or updated this month) ─────────────────────
  const { data: sopLinks } = await supabase
    .from('sop_companies')
    .select('sop_id')
    .eq('company_id', companyId)
  const sopIds = (sopLinks ?? []).map((r: { sop_id: string }) => r.sop_id)

  let sops: { title: string; status: string; created_at: string }[] = []
  if (sopIds.length > 0) {
    const { data } = await supabase
      .from('sops')
      .select('title, status, created_at')
      .in('id', sopIds)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false })
    sops = (data ?? []) as typeof sops
  }

  // ── Notes created/updated this month ──────────────────────────────────────
  const { data: noteLinks } = await db
    .from('note_companies')
    .select('note_id')
    .eq('company_id', companyId)
  const noteIds = (noteLinks ?? []).map((r: { note_id: string }) => r.note_id)

  let notes: { title: string; body: string | null; updated_at: string; team_id: string | null }[] = []
  if (noteIds.length > 0) {
    const { data } = await supabase
      .from('notes')
      .select('title, body, updated_at, team_id')
      .in('id', noteIds)
      .is('deleted_at', null)
      .gte('updated_at', monthStart)
      .order('updated_at', { ascending: false })
      .limit(20)
    notes = (data ?? []) as typeof notes
  }

  // ── Todos for this company (all, so we can see done and open this month) ──
  const { data: todoLinks } = await db
    .from('todo_companies')
    .select('todo_id')
    .eq('company_id', companyId)
  const todoIds = (todoLinks ?? []).map((r: { todo_id: string }) => r.todo_id)

  let todos: { title: string; is_done: boolean; priority: string; due_date: string | null; updated_at: string }[] = []
  if (todoIds.length > 0) {
    const { data } = await supabase
      .from('todos')
      .select('title, is_done, priority, due_date, updated_at')
      .in('id', todoIds)
      .is('deleted_at', null)
      .order('is_done', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(40)
    todos = (data ?? []) as typeof todos
  }

  const doneTodos   = todos.filter(t => t.is_done)
  const openTodos   = todos.filter(t => !t.is_done)
  const overdueTodos = openTodos.filter(t => t.due_date && new Date(t.due_date) < now)

  // ── Build the prompt ───────────────────────────────────────────────────────
  const monthName = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  const sopLines = sops.length > 0
    ? sops.map(s => `- ${s.title} [${s.status}]`).join('\n')
    : '(none this month)'

  const noteLines = notes.length > 0
    ? notes.map(n => {
        const preview = (n.body ?? '').trim().replace(/\s+/g, ' ').slice(0, 150)
        return `- "${n.title}"${preview ? ': ' + preview : ''} (${n.team_id ? 'team' : 'personal'})`
      }).join('\n')
    : '(none this month)'

  const doneLines = doneTodos.length > 0
    ? doneTodos.map(t => `- [DONE] ${t.title} (priority: ${t.priority})`).join('\n')
    : '(none)'

  const openLines = openTodos.length > 0
    ? openTodos.map(t => {
        const overdue = t.due_date && new Date(t.due_date) < now
        const due = t.due_date ? `, due ${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''
        return `- [${overdue ? 'OVERDUE' : 'OPEN'}] ${t.title} (priority: ${t.priority}${due})`
      }).join('\n')
    : '(none)'

  const prompt = `You are writing a brief monthly activity summary for the company "${company.name}" at a property-management company called Hospiria / Under The Doormat.

The data below covers ${monthName}. Please write a concise 3–4 paragraph summary covering:
1. What was accomplished (completed tasks, published SOPs)
2. What is in progress or pending (open tasks, drafts)
3. Any concerns or overdue items worth flagging
4. A short overall assessment

Keep it professional and factual. Use plain text, no markdown headers.

---
NEW / UPDATED SOPs (${monthName}):
${sopLines}

NOTES WRITTEN / UPDATED (${monthName}):
${noteLines}

TASKS COMPLETED:
${doneLines}

OPEN TASKS (including overdue):
${openLines}

OVERDUE TASK COUNT: ${overdueTodos.length}
---`

  // ── Stream the response ────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = anthropic.messages.stream({
          model: 'claude-haiku-4-5',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        })
        for await (const chunk of response) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode('\n[Summary generation failed. Please try again.]'))
        console.error('Company summary error:', err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

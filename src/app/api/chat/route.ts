export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { searchSops } from '@/lib/sop-search'

interface SopSource {
  id: string
  title: string
}

// GET — list the current user's conversations (most recent first)
export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('chat_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ conversations: data ?? [] })
}

// POST — send a message. Creates a conversation if none is supplied, runs the
// agentic search loop, persists both messages, and returns the assistant reply.
export async function POST(request: Request) {
  const supabase = createClient()
  const session = await getEffectiveSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { profile, effectiveUserId, realUserId } = session

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'The assistant is not configured (missing API key).' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const message: string = (body.message ?? '').toString().trim()
  let conversationId: string | null = body.conversationId ?? null

  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  // Conversations belong to the REAL logged-in user — chat history stays
  // personal even when a super_admin is impersonating someone.
  if (!conversationId) {
    const title = message.length > 60 ? message.slice(0, 57) + '…' : message
    const { data: conv, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: realUserId, title })
      .select('id')
      .single()
    if (error || !conv) {
      return NextResponse.json({ error: 'Could not start a conversation.' }, { status: 500 })
    }
    conversationId = conv.id
  }

  // Load prior turns for context
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  // Persist the user's message
  await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role: 'user', content: message })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const convo: Anthropic.MessageParam[] = [
    ...((history ?? []) as { role: 'user' | 'assistant'; content: string }[]).map(m => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const system = `You are the Hospiria Knowledge Base assistant — a helpful guide for staff at a short-term rental management company.

Your ONLY source of truth is the company's SOPs (Standard Operating Procedures). To answer any question, you MUST use the search_sops tool to find relevant SOPs first. Search more than once with different keywords if the first search isn't enough.

Guidelines:
- Answer concisely and practically, in the context of Hospiria's operations.
- Base every answer on the SOP content returned by the tool. Do NOT invent procedures, times, or policies that aren't in the SOPs.
- When you reference a procedure, name the SOP it came from so the user can open it.
- If a question mentions a specific company or platform (e.g. "Plum Guide", "Airbnb", a brand name), include that in your search query.
- If you genuinely cannot find anything relevant after searching, say so plainly and suggest what the user could search for or who to ask — do not guess.
- Keep a friendly, professional tone. Use short paragraphs or bullet points.`

  const tools: Anthropic.Tool[] = [
    {
      name: 'search_sops',
      description:
        'Search the Hospiria SOP knowledge base by keyword. Returns matching SOPs with their title and an excerpt of relevant content. Use specific keywords, including any company or platform names mentioned in the question.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search for, e.g. "check in time", "Plum Guide onboarding", "security deposit".',
          },
        },
        required: ['query'],
      },
    },
  ]

  const sources = new Map<string, SopSource>()
  let reply = ''

  try {
    for (let turn = 0; turn < 5; turn++) {
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system,
        tools,
        messages: convo,
      })

      if (resp.stop_reason === 'tool_use') {
        convo.push({ role: 'assistant', content: resp.content })
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of resp.content) {
          if (block.type === 'tool_use' && block.name === 'search_sops') {
            const q = ((block.input as { query?: string }).query ?? '').toString()
            const hits = await searchSops(supabase, {
              query: q,
              role: profile.role,
              effectiveUserId,
            })
            hits.forEach(h => sources.set(h.id, { id: h.id, title: h.title }))

            const text = hits.length
              ? hits
                  .map(h => `SOP: ${h.title}\nID: ${h.id}\nExcerpt: ${h.excerpt}`)
                  .join('\n\n---\n\n')
              : 'No matching SOPs found for that query.'

            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: text })
          }
        }

        convo.push({ role: 'user', content: toolResults })
        continue
      }

      reply = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim()
      break
    }
  } catch (err) {
    console.error('Chat assistant error:', err)
    return NextResponse.json({ error: 'The assistant ran into an error. Please try again.' }, { status: 500 })
  }

  if (!reply) {
    reply = "Sorry, I couldn't put together an answer. Try rephrasing your question or using different keywords."
  }

  const sourceList = [...sources.values()]

  await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role: 'assistant', content: reply, sources: sourceList })

  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return NextResponse.json({ conversationId, reply, sources: sourceList })
}

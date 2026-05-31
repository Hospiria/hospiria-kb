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

  // Load prior turns for context + the known client/platform taxonomy so the
  // assistant can recognise and ask about the right company.
  const [{ data: history }, { data: companyRows }, { data: platformRows }] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    supabase.from('companies').select('name').eq('is_active', true).order('name'),
    supabase.from('platforms').select('name').eq('is_active', true).order('name'),
  ])

  const companyNames = ((companyRows ?? []) as { name: string }[]).map(c => c.name)
  const platformNames = ((platformRows ?? []) as { name: string }[]).map(p => p.name)

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

  const companyList = companyNames.length
    ? companyNames.join(', ')
    : '(none configured yet)'
  const platformList = platformNames.length
    ? platformNames.join(', ')
    : '(none configured yet)'

  const system = `You are the Hospiria Knowledge Base assistant — an expert helper for Hospiria's internal Services team.

ABOUT HOSPIRIA
Hospiria is a Property Management System (PMS) for short-term rentals. On top of the software, Hospiria provides managed services to clients: 24/7 reservations handling, onboarding clients' listings onto booking platforms, and 24/7 in-stay guest support.

WHO YOU ARE HELPING
Your users are Hospiria's Services team — largely an outsourced team in the Philippines, working across three functions: Onboarding, Guest Services, and Reservations. They manage many different client portfolios at once.

THE KEY COMPLEXITY — PROCESSES VARY BY CLIENT
Different clients/portfolios have different processes (check-in times and methods, key handover, deposits, cancellation rules, guest messaging tone, fees, etc.). So a question like "what is our check-in process?" usually has NO single answer — it depends on the company.

HOW TO BEHAVE
1. When a question is process-specific and the user has NOT said which client it's for, ASK which company first before searching. You can reference the known clients below to help them pick.
2. Briefly clarify intent when it changes the answer — e.g. "Are you helping a guest right now, or just need the process for reference?" and, if guest-facing, "Do you want me to draft a message you can send?" Ask only the 1–2 questions that actually matter; don't interrogate.
3. Once you know the company (and intent), call search_sops with the keywords AND the company name so you pull that client's specific SOPs.
4. If the user is mid-interaction with a guest, you can DRAFT a ready-to-send guest message, using the client's templates and tone found in the SOPs. Clearly label it as a draft.
5. Always ground answers in SOP content returned by the tool — never invent times, fees, or policies. Name the SOP(s) you used. If nothing relevant exists for that client, say so and suggest escalating to their team lead rather than guessing.
6. Be concise and practical. Short paragraphs or bullets.

KNOWN CLIENTS / COMPANIES: ${companyList}

KNOWN PLATFORMS: ${platformList}`

  const tools: Anthropic.Tool[] = [
    {
      name: 'search_sops',
      description:
        'Search the Hospiria SOP knowledge base. Returns matching SOPs with their title and a relevant excerpt. Always pass the company name when the question is about a specific client, so results are scoped to that client\'s SOPs. Include any platform names (e.g. Airbnb, Plum Guide) in the query when relevant.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search for, e.g. "check in process", "onboarding", "security deposit", "extension request".',
          },
          company: {
            type: 'string',
            description: 'Optional. The client/company to scope the search to (must be one of the known clients). Omit for general/cross-client questions.',
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
            const args = block.input as { query?: string; company?: string }
            const q = (args.query ?? '').toString()
            const company = (args.company ?? '').toString()
            const hits = await searchSops(supabase, {
              query: q,
              company,
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

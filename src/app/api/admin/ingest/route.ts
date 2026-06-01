export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { normaliseConversation } from '@/lib/whatsapp-parse'
import { redactPII } from '@/lib/redact'
import { searchSops } from '@/lib/sop-search'

const MAX_CHARS = 14000           // cap transcript sent to the model
const MAX_CANDIDATES = 12

interface ExtractCandidate {
  title: string
  summary: string
  client: string | null
  keywords: string
}

interface ResultCandidate {
  title: string
  summary: string
  client: string | null
  classification: 'new' | 'update' | 'exists'
  matchedSop: { id: string; title: string } | null
  bodyMarkdown?: string
  changeNote?: string
}

function parseJsonArray<T>(text: string): T[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  try { return JSON.parse(text.slice(start, end + 1)) as T[] } catch { return [] }
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured (missing API key).' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const raw = (body.text ?? '').toString()
  if (raw.trim().length < 20) {
    return NextResponse.json({ error: 'Please paste or upload a longer conversation.' }, { status: 400 })
  }

  // 1. Normalise (WhatsApp export → clean transcript) then redact PII server-side.
  const { transcript: normalised, source } = normaliseConversation(raw)
  const { text: redacted, counts: redactionCounts } = redactPII(normalised)
  const truncated = redacted.length > MAX_CHARS
  const transcript = truncated ? redacted.slice(0, MAX_CHARS) : redacted

  const admin = createAdminClient()
  const { data: companyRows } = await admin
    .from('companies').select('id, name').eq('is_active', true).order('name')
  const companies = ((companyRows ?? []) as { id: string; name: string }[])
  const companyList = companies.map(c => c.name).join(', ') || '(none configured)'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // 2. Extract candidate SOP topics from the conversation.
  let candidates: ExtractCandidate[] = []
  try {
    const extractResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: `You read internal operations chats from Hospiria (a short-term-rental property manager) and identify reusable knowledge worth capturing as an SOP (standard operating procedure).

Pull out distinct, reusable processes/answers — NOT one-off chatter. Each should be something the team would look up again.

Known clients: ${companyList}

IMPORTANT — privacy: ignore and never reproduce any guest names, addresses, phone numbers, door/lockbox codes or booking references. Capture only the reusable process.

Respond with ONLY a JSON array (max ${MAX_CANDIDATES}), no prose:
[{"title":"short SOP title","summary":"1-2 sentence description of the process","client":"<exact known client name or null if generic>","keywords":"search keywords for finding existing SOPs"}]`,
      messages: [{ role: 'user', content: `Conversation transcript:\n\n${transcript}` }],
    })
    const text = extractResp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
    candidates = parseJsonArray<ExtractCandidate>(text).slice(0, MAX_CANDIDATES)
  } catch (err) {
    console.error('Ingest extract error:', err)
    return NextResponse.json({ error: 'Could not analyse the conversation. Try a shorter section.' }, { status: 500 })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ source, redactionCounts, truncated, companies, candidates: [] })
  }

  // 3. For each candidate, find the closest existing SOPs (role = super_admin sees all).
  const matchBlocks: string[] = []
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const hits = await searchSops(supabase, {
      query: c.keywords || c.title,
      company: c.client ?? undefined,
      role: 'super_admin',
      effectiveUserId: user.id,
      limit: 3,
    })
    const matchText = hits.length
      ? hits.map(h => `   • [${h.id}] ${h.title}: ${h.excerpt.slice(0, 200)}`).join('\n')
      : '   (no existing SOP found)'
    matchBlocks.push(`#${i} ${c.title}\n${matchText}`)
  }

  // 4. Classify each candidate and draft new SOPs / change notes.
  let results: ResultCandidate[] = []
  try {
    const draftResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 3500,
      system: `You decide whether each proposed SOP already exists in Hospiria's knowledge base, needs updating, or is new — and you draft content.

For each candidate you are given its index (#), title, and the closest existing SOPs (with their id and an excerpt).

Classify each:
- "exists"  — an existing SOP already covers this well. Reference its id.
- "update"  — an existing SOP is close but the conversation adds or changes something. Reference its id and write a "changeNote" describing exactly what to add/change.
- "new"     — nothing covers it. Write a full SOP body in clean Markdown (headings, steps, bullet lists) under "bodyMarkdown".

Privacy: never include guest names, addresses, phone numbers, door codes or booking references in any draft. Write the general process only.

Respond with ONLY a JSON array, no prose:
[{"index":0,"classification":"new|update|exists","matchedSopId":"<id or null>","bodyMarkdown":"<for new only>","changeNote":"<for update only>"}]`,
      messages: [{
        role: 'user',
        content: `Candidates:\n${candidates.map((c, i) => `#${i} ${c.title} — ${c.summary} (client: ${c.client ?? 'generic'})`).join('\n')}\n\nClosest existing SOPs per candidate:\n${matchBlocks.join('\n\n')}\n\nRelevant transcript (redacted):\n${transcript}`,
      }],
    })
    const text = draftResp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
    const drafts = parseJsonArray<{
      index: number
      classification: 'new' | 'update' | 'exists'
      matchedSopId: string | null
      bodyMarkdown?: string
      changeNote?: string
    }>(text)

    const draftByIndex = new Map(drafts.map(d => [d.index, d]))
    const titleById = new Map<string, string>()
    // We don't have titles for matched ids here; resolve from a quick lookup.
    const allMatchedIds = [...new Set(drafts.map(d => d.matchedSopId).filter(Boolean) as string[])]
    if (allMatchedIds.length) {
      const { data: matchedSops } = await admin.from('sops').select('id, title').in('id', allMatchedIds)
      for (const s of (matchedSops ?? []) as { id: string; title: string }[]) titleById.set(s.id, s.title)
    }

    results = candidates.map((c, i) => {
      const d = draftByIndex.get(i)
      const classification = d?.classification ?? 'new'
      const matchedId = d?.matchedSopId ?? null
      return {
        title: c.title,
        summary: c.summary,
        client: c.client,
        classification,
        matchedSop: matchedId ? { id: matchedId, title: titleById.get(matchedId) ?? 'Existing SOP' } : null,
        bodyMarkdown: classification === 'new' ? (d?.bodyMarkdown ?? `# ${c.title}\n\n${c.summary}`) : undefined,
        changeNote: classification === 'update' ? d?.changeNote : undefined,
      }
    })
  } catch (err) {
    console.error('Ingest draft error:', err)
    return NextResponse.json({ error: 'Could not draft SOPs from the conversation. Try a shorter section.' }, { status: 500 })
  }

  return NextResponse.json({ source, redactionCounts, truncated, companies, candidates: results })
}

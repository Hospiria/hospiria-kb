export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { tiptapToPlainText } from '@/lib/utils'
import type { CompanyLite, CompanySuggestion } from '@/lib/company-match'
import type { TiptapContent } from '@/types'

interface AiResult {
  id: string
  title: string
  suggestions: CompanySuggestion[]
}

// POST — run an AI pass over a batch of SOPs the name-matcher couldn't place.
// Body: { sopIds: string[] } (keep batches small, ~8, to stay within budget).
// Returns one entry per SOP with company suggestions (confidence 'ai').
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
  const sopIds: string[] = Array.isArray(body.sopIds) ? body.sopIds.slice(0, 12) : []
  if (sopIds.length === 0) return NextResponse.json({ results: [] })

  const admin = createAdminClient()
  const [{ data: sopRows }, { data: companyRows }] = await Promise.all([
    admin.from('sops').select('id, title, content').in('id', sopIds),
    admin.from('companies').select('id, name').eq('is_active', true).order('name'),
  ])

  const companies = ((companyRows ?? []) as CompanyLite[])
  const sops = ((sopRows ?? []) as { id: string; title: string; content: TiptapContent | null }[])
  const byName = new Map(companies.map(c => [c.name.toLowerCase(), c]))

  // Trim each SOP's body so the prompt stays bounded for the batch.
  const docs = sops.map(s => ({
    id: s.id,
    title: s.title,
    text: tiptapToPlainText(s.content).slice(0, 1500),
  }))

  const companyList = companies.map(c => c.name).join('\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const system = `You match internal SOP (standard operating procedure) documents to the client/company they belong to.

Hospiria is a property-management company; each SOP usually describes a process for ONE specific client portfolio, though some are generic (apply to all clients) and some mention no client at all.

You will be given the exact list of known companies and a batch of SOPs (title + excerpt). For each SOP, decide which of the KNOWN companies it is about. Rules:
- Only choose names from the provided list, spelled EXACTLY as given.
- A company may be referenced by a shortened form (e.g. "Orchard" for "Orchard by UTDM"). Match it to the full list entry.
- If the SOP is generic or you cannot confidently tell, return an empty array for that SOP — do not guess.
- Most SOPs belong to exactly one company; occasionally two.

Respond with ONLY a JSON array, no prose, in this shape:
[{"id":"<sop id>","companies":["<exact company name>", ...]}]`

  const userMsg = `KNOWN COMPANIES:\n${companyList}\n\nSOPs:\n${docs
    .map(d => `--- SOP id: ${d.id}\nTitle: ${d.title}\nExcerpt: ${d.text}`)
    .join('\n\n')}`

  let parsed: { id: string; companies: string[] }[] = []
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
    const jsonStart = text.indexOf('[')
    const jsonEnd = text.lastIndexOf(']')
    if (jsonStart !== -1 && jsonEnd !== -1) {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
    }
  } catch (err) {
    console.error('Auto-tag AI error:', err)
    return NextResponse.json({ error: 'The AI pass failed. Try a smaller batch.' }, { status: 500 })
  }

  const byId = new Map(parsed.map(p => [p.id, p.companies ?? []]))

  const results: AiResult[] = docs.map(d => {
    const names = byId.get(d.id) ?? []
    const suggestions: CompanySuggestion[] = []
    for (const name of names) {
      const company = byName.get(String(name).toLowerCase())
      if (company) {
        suggestions.push({
          companyId: company.id,
          name: company.name,
          confidence: 'ai',
          where: 'content',
          count: 0,
        })
      }
    }
    return { id: d.id, title: d.title, suggestions }
  })

  return NextResponse.json({ results })
}

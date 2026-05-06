export const maxDuration = 60 // Allow up to 60s for AI generation

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TiptapContent, TiptapNode } from '@/types'

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
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { sopId, generateAll } = await request.json()

  // Get SOPs to generate quizzes for
  let sopIds: string[] = []
  if (generateAll) {
    // All live SOPs without a quiz
    const { data: sops } = await adminClient.from('sops').select('id').eq('status', 'live')
    const { data: existing } = await adminClient.from('quizzes').select('sop_id')
    const existingIds = new Set((existing ?? []).map((q: { sop_id: string }) => q.sop_id))
    sopIds = (sops ?? []).map((s: { id: string }) => s.id).filter((id: string) => !existingIds.has(id))
  } else if (sopId) {
    sopIds = [sopId]
  } else {
    return NextResponse.json({ error: 'Missing sopId or generateAll' }, { status: 400 })
  }

  if (sopIds.length === 0) return NextResponse.json({ generated: 0, message: 'No SOPs need quizzes' })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const results: { sopId: string; title: string; status: 'generated' | 'error'; error?: string }[] = []

  for (const id of sopIds) {
    try {
      const { data: sop } = await adminClient.from('sops').select('id, title, content').eq('id', id).single()
      if (!sop) { results.push({ sopId: id, title: id, status: 'error', error: 'SOP not found' }); continue }

      const plainText = tiptapToText(sop.content as TiptapContent | null).trim()
      if (!plainText) { results.push({ sopId: id, title: sop.title, status: 'error', error: 'No content' }); continue }

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
        messages: [{ role: 'user', content: prompt }]
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) { results.push({ sopId: id, title: sop.title, status: 'error', error: 'AI returned invalid JSON' }); continue }

      const questions = JSON.parse(jsonMatch[0])

      const { error } = await adminClient
        .from('quizzes')
        .upsert({ sop_id: id, title: sop.title, questions, pass_mark: 80, status: 'active' }, { onConflict: 'sop_id' })

      if (error) { results.push({ sopId: id, title: sop.title, status: 'error', error: error.message }); continue }
      results.push({ sopId: id, title: sop.title, status: 'generated' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      results.push({ sopId: id, title: id, status: 'error', error: msg })
    }
  }

  return NextResponse.json({ results, generated: results.filter(r => r.status === 'generated').length })
}

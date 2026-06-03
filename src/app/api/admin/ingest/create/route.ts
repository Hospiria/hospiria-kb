export const maxDuration = 60

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { markdownToTiptap } from '@/lib/markdownToTiptap'
import { NextResponse } from 'next/server'

interface NewSop {
  title: string
  bodyMarkdown: string
  companyIds: string[]
}

// POST — create draft SOPs from approved ingestion candidates.
// Each becomes a status='draft' SOP (admin-visible, enters the normal review
// flow) tagged to the chosen companies. Body: { items: NewSop[] }
export async function POST(request: Request) {
  const auth = await requireFeature('ai_training', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const items: NewSop[] = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return NextResponse.json({ success: true, created: 0 })

  const admin = createServiceClient()
  const created: { id: string; title: string }[] = []
  let lastError = ''

  for (const item of items) {
    const title = (item?.title ?? '').toString().trim()
    const md = (item?.bodyMarkdown ?? '').toString()
    if (!title || !md.trim()) continue

    const content = markdownToTiptap(md)
    const { data: sop, error } = await admin
      .from('sops')
      .insert({ title, content, status: 'draft', author_id: user.id })
      .select('id, title')
      .single()

    if (error || !sop) {
      lastError = error?.message ?? 'insert failed'
      console.error('Ingest create SOP error:', lastError, title)
      continue
    }

    const companyIds = Array.isArray(item.companyIds) ? item.companyIds.filter(Boolean) : []
    if (companyIds.length) {
      await admin.from('sop_companies').upsert(
        companyIds.map(cid => ({ sop_id: sop.id, company_id: cid })),
        { onConflict: 'sop_id,company_id', ignoreDuplicates: true }
      )
    }

    created.push({ id: sop.id, title: sop.title })
  }

  // If we were asked to create SOPs but none landed, that's a real failure —
  // surface it instead of silently returning "created: 0".
  if (created.length === 0) {
    return NextResponse.json(
      { error: lastError ? `Could not save SOPs: ${lastError}` : 'No SOPs were created (nothing had a title and body).' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, created: created.length, sops: created })
}

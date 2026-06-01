export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
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
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const items: NewSop[] = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return NextResponse.json({ success: true, created: 0 })

  const admin = createAdminClient()
  const created: { id: string; title: string }[] = []

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
      console.error('Ingest create SOP error:', error?.message, title)
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

  return NextResponse.json({ success: true, created: created.length, sops: created })
}

export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { tiptapToPlainText } from '@/lib/utils'
import { suggestCompanies, type CompanyLite, type CompanySuggestion } from '@/lib/company-match'
import type { TiptapContent } from '@/types'

interface ScanRow {
  id: string
  title: string
  suggestions: CompanySuggestion[]
}

// POST — scan every SOP against the active company list and propose tags.
// Deterministic name-matching only (no AI here). Groups results into:
//   confident — at least one high-confidence match (auto-checked in the UI)
//   review    — only low-confidence matches (needs a human eye)
//   unmatched — no name match at all (candidates for the AI pass)
// SOPs that already have company tags are skipped so we never double-tag.
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const [{ data: sopRows }, { data: companyRows }, { data: linkRows }] = await Promise.all([
    admin.from('sops').select('id, title, content').order('title'),
    admin.from('companies').select('id, name').eq('is_active', true).order('name'),
    admin.from('sop_companies').select('sop_id'),
  ])

  const companies = ((companyRows ?? []) as CompanyLite[])
  const sops = ((sopRows ?? []) as { id: string; title: string; content: TiptapContent | null }[])

  // SOPs that already carry at least one company tag — leave them alone.
  const alreadyTagged = new Set(((linkRows ?? []) as { sop_id: string }[]).map(r => r.sop_id))

  const confident: ScanRow[] = []
  const review: ScanRow[] = []
  const unmatched: { id: string; title: string }[] = []

  // We exclude nothing per-SOP here (excludeIds is for skipping specific
  // companies); the already-tagged skip happens at the SOP level below.
  const excludeIds = new Set<string>()

  for (const sop of sops) {
    if (alreadyTagged.has(sop.id)) continue

    const content = tiptapToPlainText(sop.content)
    const suggestions = suggestCompanies(sop.title, content, companies, excludeIds)

    if (suggestions.length === 0) {
      unmatched.push({ id: sop.id, title: sop.title })
    } else if (suggestions.some(s => s.confidence === 'high')) {
      confident.push({ id: sop.id, title: sop.title, suggestions })
    } else {
      review.push({ id: sop.id, title: sop.title, suggestions })
    }
  }

  return NextResponse.json({
    companies,
    confident,
    review,
    unmatched,
    counts: {
      total: sops.length,
      alreadyTagged: alreadyTagged.size,
      confident: confident.length,
      review: review.length,
      unmatched: unmatched.length,
    },
  })
}

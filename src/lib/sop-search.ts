import type { SupabaseClient } from '@supabase/supabase-js'
import { TiptapContent } from '@/types'
import { getSnippet } from './utils'

const NO_MATCH = '00000000-0000-0000-0000-000000000000'

export interface SopSearchResult {
  id: string
  title: string
  excerpt: string
}

/**
 * Search SOPs by keyword — optionally scoped to a specific company/client —
 * applying the same role-based visibility rules as the SOPs list page, and
 * return short excerpts the chat assistant can answer from.
 *
 * Keyword matching mirrors the SOPs page: a union of a title substring match
 * (`ilike`) and full-text search over the content vector, so partial words and
 * body-text mentions are both found.
 *
 * When `company` is given, results are scoped to SOPs tagged to that client
 * (via the sop_companies junction). If the keyword finds nothing within that
 * client's SOPs, we fall back to the client's full SOP set so the assistant can
 * still see what exists and guide the user.
 */
export async function searchSops(
  supabase: SupabaseClient,
  opts: { query: string; role: string; effectiveUserId: string; company?: string; limit?: number }
): Promise<SopSearchResult[]> {
  const { query, role, effectiveUserId, company, limit = 6 } = opts
  const s = (query ?? '').trim()
  const companyName = (company ?? '').trim()

  // 1. Resolve a company filter to a set of SOP ids (if a client was named)
  let companyIds: string[] | null = null
  if (companyName) {
    const { data: comps } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', `%${companyName}%`)
      .eq('is_active', true)
      .limit(1)
    const companyId = (comps as { id: string }[] | null)?.[0]?.id
    if (companyId) {
      const { data: links } = await supabase
        .from('sop_companies')
        .select('sop_id')
        .eq('company_id', companyId)
      companyIds = ((links ?? []) as { sop_id: string }[]).map(r => r.sop_id)
      if (companyIds.length === 0) companyIds = [NO_MATCH]
    }
  }

  // 2. Keyword matches (title substring + content full-text)
  let keywordIds: string[] = []
  if (s) {
    const [{ data: titleHits }, { data: ftsHits }] = await Promise.all([
      supabase.from('sops').select('id').ilike('title', `%${s}%`),
      supabase
        .from('sops')
        .select('id')
        .textSearch('search_vector', s, { type: 'websearch', config: 'english' }),
    ])
    keywordIds = [
      ...new Set([
        ...((titleHits ?? []) as { id: string }[]).map(r => r.id),
        ...((ftsHits ?? []) as { id: string }[]).map(r => r.id),
      ]),
    ]
  }

  // 3. Combine company + keyword filters
  let ids: string[]
  if (companyIds) {
    if (s) {
      const set = new Set(companyIds)
      const intersection = keywordIds.filter(id => set.has(id))
      ids = intersection.length > 0 ? intersection : companyIds // fall back to client's SOPs
    } else {
      ids = companyIds
    }
  } else {
    ids = keywordIds
  }
  if (ids.length === 0) return []

  // 4. Role-based visibility — same rules as src/app/(app)/sops/page.tsx
  let q = supabase.from('sops').select('id, title, content, status, author_id').in('id', ids)
  if (role === 'agent') {
    q = q.eq('status', 'live')
  } else if (role === 'junior_team_leader') {
    q = q.or(`author_id.eq.${effectiveUserId},status.eq.live`)
  }
  // team_leader, approver, super_admin see everything

  const { data } = await q.limit(limit)

  return ((data ?? []) as { id: string; title: string; content: TiptapContent | null }[]).map(sop => ({
    id: sop.id,
    title: sop.title,
    excerpt: getSnippet(sop.content, s, 700),
  }))
}

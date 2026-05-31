import type { SupabaseClient } from '@supabase/supabase-js'
import { TiptapContent } from '@/types'
import { getSnippet } from './utils'

export interface SopSearchResult {
  id: string
  title: string
  excerpt: string
}

/**
 * Search SOPs by keyword, applying the same role-based visibility rules as the
 * SOPs list page, and return short excerpts the chat assistant can answer from.
 *
 * Matching mirrors the SOPs page search fix: a union of a title substring match
 * (`ilike`) and full-text search over the content vector — so partial words and
 * body-text mentions are both found.
 */
export async function searchSops(
  supabase: SupabaseClient,
  opts: { query: string; role: string; effectiveUserId: string; limit?: number }
): Promise<SopSearchResult[]> {
  const { query, role, effectiveUserId, limit = 6 } = opts
  const s = query.trim()
  if (!s) return []

  // Title substring + content full-text, then union the ids
  const [{ data: titleHits }, { data: ftsHits }] = await Promise.all([
    supabase.from('sops').select('id').ilike('title', `%${s}%`),
    supabase
      .from('sops')
      .select('id')
      .textSearch('search_vector', s, { type: 'websearch', config: 'english' }),
  ])

  const ids = [
    ...new Set([
      ...((titleHits ?? []) as { id: string }[]).map(r => r.id),
      ...((ftsHits ?? []) as { id: string }[]).map(r => r.id),
    ]),
  ]
  if (ids.length === 0) return []

  // Role-based visibility — same rules as src/app/(app)/sops/page.tsx
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

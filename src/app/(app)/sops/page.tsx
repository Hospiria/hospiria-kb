export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Sop } from '@/types'
import { SopDragList } from '@/components/sops/SopDragList'
import { SopFilters } from '@/components/sops/SopFilters'

interface SearchParams {
  search?: string
  status?: string
  team?: string
  category?: string
  company?: string
  platform?: string
}

export default async function SopsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getEffectiveSession()
  if (!session || !session.profile) redirect('/login')

  const { profile, effectiveUserId } = session
  const supabase = createClient()

  const teamId = searchParams.team ?? null
  const categoryId = searchParams.category ?? null
  const companyId = searchParams.company ?? null
  const platformId = searchParams.platform ?? null

  // Resolve display names
  let pageTitle = 'All SOPs'
  let pageSubtitle = ''

  if (teamId) {
    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single()
    if (team) pageTitle = team.name
  }
  if (categoryId) {
    const { data: cat } = await supabase.from('categories').select('name').eq('id', categoryId).single()
    if (cat) {
      pageSubtitle = pageTitle
      pageTitle = cat.name
    }
  }
  if (companyId) {
    const { data: company } = await supabase.from('companies').select('name').eq('id', companyId).single()
    if (company) {
      pageTitle = company.name
      pageSubtitle = 'Company'
    }
  }
  if (platformId) {
    const { data: platform } = await supabase.from('platforms').select('name').eq('id', platformId).single()
    if (platform) {
      pageTitle = platform.name
      pageSubtitle = 'Platform'
    }
  }

  // Fetch full lists for filter dropdowns
  const [{ data: filterTeams }, { data: filterCompanies }, { data: filterPlatforms }] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('platforms').select('id, name').eq('is_active', true).order('name'),
  ])

  // Pre-filter: resolve SOP ids for junction-based filters
  let companyFilterIds: string[] | null = null
  if (companyId) {
    const { data } = await supabase.from('sop_companies').select('sop_id').eq('company_id', companyId)
    companyFilterIds = (data ?? []).map(r => r.sop_id)
  }

  let platformFilterIds: string[] | null = null
  if (platformId) {
    const { data } = await supabase.from('sop_platforms').select('sop_id').eq('platform_id', platformId)
    platformFilterIds = (data ?? []).map(r => r.sop_id)
  }

  let query = supabase
    .from('sops')
    .select(`
      *,
      categories(id, name, team_id, teams(id, name)),
      profiles(id, full_name),
      sop_teams(team_id, teams(id, name))
    `)
    .order('title', { ascending: true })

  if (teamId) {
    query = (query as typeof query).eq('sop_teams.team_id', teamId)
  }
  if (companyFilterIds !== null) {
    query = companyFilterIds.length > 0
      ? query.in('id', companyFilterIds)
      : query.in('id', ['00000000-0000-0000-0000-000000000000']) // no results sentinel
  }
  if (platformFilterIds !== null) {
    query = platformFilterIds.length > 0
      ? query.in('id', platformFilterIds)
      : query.in('id', ['00000000-0000-0000-0000-000000000000']) // no results sentinel
  }

  // Role-based visibility using effective profile
  if (profile.role === 'agent') {
    query = query.eq('status', 'live')
  } else if (profile.role === 'junior_team_leader') {
    query = query.or(`author_id.eq.${effectiveUserId},status.eq.live`)
  }
  // team_leader, approver, super_admin see everything (no filter)

  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.search) {
    const s = searchParams.search.trim()
    // Run title ilike + content FTS in parallel, then filter to the union of both result sets.
    // This means "hand" finds "Handling Guest Enquiries" (title substring) AND SOPs
    // with "hand" anywhere in their content (FTS), rather than relying solely on
    // tsvector stemming which doesn't do partial-word matching.
    const [{ data: titleHits }, { data: ftsHits }] = await Promise.all([
      supabase.from('sops').select('id').ilike('title', `%${s}%`),
      supabase.from('sops').select('id').textSearch('search_vector', s, { type: 'websearch', config: 'english' }),
    ])
    const matchIds = [...new Set([
      ...(titleHits ?? []).map((r: { id: string }) => r.id),
      ...(ftsHits ?? []).map((r: { id: string }) => r.id),
    ])]
    query = matchIds.length > 0
      ? query.in('id', matchIds)
      : query.in('id', ['00000000-0000-0000-0000-000000000000']) // no results sentinel
  }
  if (categoryId) query = query.eq('category_id', categoryId)

  const { data: allSops } = await query

  const sops = teamId
    ? (allSops ?? []).filter((sop: Sop & { sop_teams?: { team_id: string }[] }) =>
        sop.sop_teams?.some(t => t.team_id === teamId)
      )
    : (allSops ?? [])

  const canCreate = profile.role !== 'agent'
  const canDrag = ['super_admin', 'approver', 'team_leader', 'junior_team_leader'].includes(profile.role)
  const grouped = groupByCategory(sops)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">{pageTitle}</h1>
          {pageSubtitle && <p className="text-gray-400 text-xs mt-0.5">{pageSubtitle}</p>}
          <p className="text-gray-500 text-sm mt-0.5">{sops.length} SOP{sops.length !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <Link
            href="/sops/new"
            className="flex items-center gap-2 px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New SOP
          </Link>
        )}
      </div>

      <SopFilters
        teams={filterTeams ?? []}
        companies={filterCompanies ?? []}
        platforms={filterPlatforms ?? []}
        canFilterByStatus={profile.role !== 'agent'}
      />

      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No SOPs found</p>
          {canCreate && (
            <Link href="/sops/new" className="mt-3 inline-block text-teal-600 text-sm hover:underline">
              Create your first SOP
            </Link>
          )}
        </div>
      ) : (
        <SopDragList
          key={[searchParams.team, searchParams.company, searchParams.platform, searchParams.category, searchParams.status, searchParams.search].join('|')}
          grouped={grouped}
          search={searchParams.search}
          canDrag={canDrag}
        />
      )}
    </div>
  )
}


function groupByCategory(sops: Sop[]) {
  const map = new Map<string, { categoryId: string | null; sops: Sop[] }>()
  for (const sop of sops) {
    const cat = sop.categories?.name ?? 'Uncategorised'
    const catId = sop.category_id ?? null
    if (!map.has(cat)) map.set(cat, { categoryId: catId, sops: [] })
    map.get(cat)!.sops.push(sop)
  }
  return Array.from(map.entries()).map(([category, { categoryId, sops }]) => ({
    category,
    categoryId,
    sops,
  }))
}

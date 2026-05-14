export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Sop } from '@/types'
import { SopDragList } from '@/components/sops/SopDragList'

interface SearchParams { search?: string; status?: string; team?: string; category?: string }

export default async function SopsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getEffectiveSession()
  if (!session || !session.profile) redirect('/login')

  const { profile, effectiveUserId } = session
  const supabase = createClient()

  const teamId = searchParams.team ?? null
  const categoryId = searchParams.category ?? null
  let teamName = 'All SOPs'
  let categoryName = ''
  if (teamId) {
    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single()
    if (team) teamName = team.name
  }
  if (categoryId) {
    const { data: cat } = await supabase.from('categories').select('name').eq('id', categoryId).single()
    if (cat) categoryName = cat.name
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

  // Role-based visibility using effective profile
  if (profile.role === 'agent') {
    query = query.eq('status', 'live')
  } else if (profile.role === 'junior_team_leader') {
    query = query.or(`author_id.eq.${effectiveUserId},status.eq.live`)
  }
  // team_leader, approver, super_admin see everything (no filter)

  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.search) {
    // Full-text search across title + content via generated search_vector column
    query = query.textSearch('search_vector', searchParams.search, { type: 'websearch', config: 'english' })
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
          <h1 className="text-2xl font-bold text-navy-700">{categoryName || teamName}</h1>
          {categoryName && <p className="text-gray-400 text-xs mt-0.5">{teamName}</p>}
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

      <div className="flex gap-3 mb-6 flex-wrap">
        <form className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            name="search"
            defaultValue={searchParams.search}
            placeholder="Search SOPs…"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
          {teamId && <input type="hidden" name="team" value={teamId} />}
          {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        </form>

        {profile.role !== 'agent' && (
          <div className="flex gap-2 flex-wrap">
            {['', 'draft', 'submitted', 'changes_requested', 'live', 'archived'].map(s => (
              <Link
                key={s}
                href={`/sops?${teamId ? `team=${teamId}&` : ''}${s ? `status=${s}` : ''}`}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  (searchParams.status ?? '') === s
                    ? 'bg-navy-700 text-white border-navy-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ') : 'All'}
              </Link>
            ))}
          </div>
        )}
      </div>

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
        <SopDragList grouped={grouped} search={searchParams.search} canDrag={canDrag} />
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

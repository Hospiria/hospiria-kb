export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { Plus, Search } from 'lucide-react'
import { Sop } from '@/types'

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
    .order('updated_at', { ascending: false })

  if (teamId) {
    query = (query as typeof query).eq('sop_teams.team_id', teamId)
  }

  // Role-based visibility using effective profile
  if (profile.role === 'agent') {
    query = query.eq('status', 'live')
  } else if (profile.role === 'author') {
    query = query.or(`author_id.eq.${effectiveUserId},status.eq.live`)
  }

  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.search) query = query.ilike('title', `%${searchParams.search}%`)
  if (categoryId) query = query.eq('category_id', categoryId)

  const { data: allSops } = await query

  const sops = teamId
    ? (allSops ?? []).filter((sop: Sop & { sop_teams?: { team_id: string }[] }) =>
        sop.sop_teams?.some(t => t.team_id === teamId)
      )
    : (allSops ?? [])

  const canCreate = profile.role !== 'agent'
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
        <div className="space-y-8">
          {grouped.map(({ category, sops }) => (
            <div key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{category}</h2>
              <div className="space-y-2">
                {sops.map(sop => <SopRow key={sop.id} sop={sop} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SopRow({ sop }: { sop: Sop & { profiles?: { full_name: string | null } } }) {
  return (
    <Link
      href={`/sops/${sop.id}`}
      className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:shadow-sm transition-all group"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-navy-700 group-hover:text-teal-600 transition-colors truncate">
          {sop.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {sop.profiles?.full_name ?? 'Unknown'} · Updated {formatDate(sop.updated_at)}
        </p>
      </div>
      <div className="ml-4">
        <StatusBadge status={sop.status} />
      </div>
    </Link>
  )
}

function groupByCategory(sops: Sop[]) {
  const map = new Map<string, Sop[]>()
  for (const sop of sops) {
    const cat = (sop as Sop & { categories?: { name: string } }).categories?.name ?? 'Uncategorised'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(sop)
  }
  return Array.from(map.entries()).map(([category, sops]) => ({ category, sops }))
}

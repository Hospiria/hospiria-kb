export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TiptapViewer } from '@/components/sops/TiptapViewer'
import { VersionHistoryPanel } from '@/components/sops/VersionHistoryPanel'
import { formatDateTime } from '@/lib/utils'
import { Edit, ChevronLeft, CheckCircle, Clock, Link2, ChevronRight } from 'lucide-react'
import { getEffectiveSession } from '@/lib/impersonation'
import { canEditAnySop, canApproveSop, canSeeAllDrafts, canCreateSop } from '@/lib/roles'
import { createServiceClient } from '@/lib/supabase/server'
import { SopNotesPanel } from '@/components/sops/SopNotesPanel'

export default async function SopViewPage({ params }: { params: { id: string } }) {
  const session = await getEffectiveSession()
  if (!session || !session.profile) redirect('/login')
  const { profile, effectiveUserId } = session
  const supabase = createClient()

  const { data: sop } = await supabase
    .from('sops')
    .select(`
      *,
      categories(id, name, team_id, teams(id, name)),
      profiles(id, full_name),
      sop_teams(team_id, teams(id, name))
    `)
    .eq('id', params.id)
    .single()

  if (!sop) notFound()

  const { data: versions } = await supabase
    .from('sop_versions')
    .select('*, profiles(full_name)')
    .eq('sop_id', params.id)
    .order('version_number', { ascending: false })

  const { data: pendingApproval } = await supabase
    .from('approvals')
    .select('*, profiles(full_name)')
    .eq('sop_id', params.id)
    .eq('status', 'pending')
    .single()

  // Related SOPs — links are stored once per pair, so check both directions
  // and resolve the "other" SOP. Only surface ones this viewer is allowed to
  // see (drafts stay hidden from roles that can't see drafts).
  const { data: relLinkRows } = await supabase
    .from('sop_links')
    .select('sop_a, sop_b')
    .or(`sop_a.eq.${params.id},sop_b.eq.${params.id}`)
  const relatedIds = (relLinkRows ?? []).map(l => (l.sop_a === params.id ? l.sop_b : l.sop_a))
  const { data: relatedSopsRaw } = relatedIds.length
    ? await supabase.from('sops').select('id, title, status').in('id', relatedIds)
    : { data: [] as { id: string; title: string; status: string }[] }
  const canSeeDrafts = canSeeAllDrafts(profile.role)
  const relatedSops = ((relatedSopsRaw ?? []) as { id: string; title: string; status: string }[])
    .filter(r => r.status === 'live' || canSeeDrafts)
    .sort((a, b) => a.title.localeCompare(b.title))

  // People + teams for SOP notes panel
  const db = createServiceClient()
  const [{ data: sopNotesPeople }, { data: sopNotesTeams }] = await Promise.all([
    db.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('teams').select('id, name').order('name'),
  ])

  // Can edit: admins/approvers can edit any; team leaders + junior TLs can edit their own
  const isOwner = sop.author_id === effectiveUserId
  const canEdit = canEditAnySop(profile.role) || (canCreateSop(profile.role) && isOwner)
  const canApprove = canApproveSop(profile.role)
  const showVersions = canSeeAllDrafts(profile.role) || canCreateSop(profile.role)

  const teams = (sop as { sop_teams?: { team_id: string; teams?: { name: string } }[] }).sop_teams ?? []

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/sops" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-4 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to SOPs
      </Link>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Header card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <StatusBadge status={sop.status} />
                  {(sop as { categories?: { name: string; teams?: { name: string } } }).categories && (
                    <span className="text-xs text-gray-400">
                      {(sop as { categories?: { name: string; teams?: { name: string } } }).categories?.teams?.name} ·{' '}
                      {(sop as { categories?: { name: string } }).categories?.name}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-navy-700">{sop.title}</h1>
                <p className="text-sm text-gray-400 mt-1">
                  By {(sop as { profiles?: { full_name: string | null } }).profiles?.full_name ?? 'Unknown'} ·
                  Updated {formatDateTime(sop.updated_at)} ·
                  v{sop.current_version}
                </p>
              </div>
              <div className="flex gap-2">
                {canApprove && sop.status === 'submitted' && (
                  <Link
                    href={`/sops/${sop.id}/approve`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Review
                  </Link>
                )}
                {canEdit && (sop.status !== 'live' || canEditAnySop(profile.role)) && (
                  <Link
                    href={`/sops/${sop.id}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </Link>
                )}
              </div>
            </div>

            {pendingApproval && (
              <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-700">
                  Awaiting review from {(pendingApproval as { profiles?: { full_name: string | null } }).profiles?.full_name ?? 'approver'}
                </p>
              </div>
            )}

            {teams.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {teams.map(t => (
                  <span key={t.team_id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {t.teams?.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* SOP content */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {sop.content ? (
              <TiptapViewer content={sop.content} />
            ) : (
              <div className="p-12 text-center text-gray-400">
                <p>No content yet.</p>
                {canEdit && (
                  <Link href={`/sops/${sop.id}/edit`} className="text-teal-600 hover:underline text-sm mt-2 inline-block">
                    Add content
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Related SOPs */}
          {relatedSops.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 mt-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                <Link2 className="w-4 h-4 text-teal-500" /> Related SOPs
              </h2>
              <ul className="divide-y divide-gray-100">
                {relatedSops.map(r => (
                  <li key={r.id}>
                    <Link
                      href={`/sops/${r.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 group"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-navy-700 group-hover:text-teal-600 transition-colors truncate">{r.title}</span>
                        {r.status !== 'live' && (
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">{r.status}</span>
                        )}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right sidebar: version history + notes panel */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {showVersions && versions && versions.length > 0 && (
            <VersionHistoryPanel
              versions={versions}
              currentVersion={sop.current_version}
              sopId={sop.id}
              isSuperAdmin={profile.role === 'super_admin'}
            />
          )}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <SopNotesPanel
              sopId={sop.id}
              teams={(sopNotesTeams ?? []) as { id: string; name: string }[]}
              people={(sopNotesPeople ?? []) as { id: string; full_name: string | null }[]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

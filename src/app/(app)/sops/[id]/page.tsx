import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TiptapViewer } from '@/components/sops/TiptapViewer'
import { VersionHistoryPanel } from '@/components/sops/VersionHistoryPanel'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Edit, ChevronLeft, CheckCircle, Clock } from 'lucide-react'

export default async function SopViewPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

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

  const canEdit = profile.role === 'super_admin' || (profile.role === 'author' && sop.author_id === user.id)
  const canApprove = profile.role === 'super_admin' || profile.role === 'approver'
  const showVersions = profile.role === 'super_admin' || profile.role === 'approver' || profile.role === 'author'

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
                {canEdit && sop.status !== 'live' && (
                  <Link
                    href={`/sops/${sop.id}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </Link>
                )}
                {canEdit && sop.status === 'live' && profile.role === 'super_admin' && (
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
        </div>

        {/* Version history sidebar */}
        {showVersions && versions && versions.length > 0 && (
          <div className="w-64 flex-shrink-0">
            <VersionHistoryPanel
              versions={versions}
              currentVersion={sop.current_version}
              sopId={sop.id}
              isSuperAdmin={profile.role === 'super_admin'}
            />
          </div>
        )}
      </div>
    </div>
  )
}

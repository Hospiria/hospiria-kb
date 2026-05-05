import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TiptapViewer } from '@/components/sops/TiptapViewer'
import { ApprovalActions } from '@/components/sops/ApprovalActions'
import { StatusBadge } from '@/components/ui/StatusBadge'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export default async function ApproveSopPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['approver', 'super_admin'].includes(profile.role)) redirect('/sops')

  const { data: sop } = await supabase
    .from('sops')
    .select('*, categories(name, teams(name)), profiles(full_name)')
    .eq('id', params.id)
    .single()
  if (!sop || sop.status !== 'submitted') notFound()

  const { data: pendingApproval } = await supabase
    .from('approvals')
    .select('*')
    .eq('sop_id', params.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <div className="max-w-4xl mx-auto">
      <Link href={`/sops/${params.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-4 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to SOP
      </Link>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
        <p className="text-sm font-semibold text-amber-800 mb-1">SOP Awaiting Your Review</p>
        <p className="text-sm text-amber-700">Review the content below and approve, request changes, or reject.</p>
      </div>

      {/* SOP metadata */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={sop.status} />
          <span className="text-xs text-gray-400">
            {(sop as { categories?: { name: string; teams?: { name: string } } }).categories?.teams?.name} ·{' '}
            {(sop as { categories?: { name: string } }).categories?.name}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-navy-700">{sop.title}</h1>
        <p className="text-sm text-gray-400 mt-1">
          By {(sop as { profiles?: { full_name: string | null } }).profiles?.full_name ?? 'Unknown'} ·
          Submitted {formatDateTime(sop.updated_at)}
        </p>
      </div>

      {/* Content */}
      <div className="bg-white border border-gray-200 rounded-2xl mb-6 overflow-hidden">
        {sop.content ? (
          <TiptapViewer content={sop.content} />
        ) : (
          <p className="p-8 text-gray-400 text-center">No content</p>
        )}
      </div>

      {/* Approval actions */}
      <ApprovalActions
        sopId={params.id}
        approvalId={pendingApproval?.id ?? null}
        authorId={sop.author_id}
        sopTitle={sop.title}
      />
    </div>
  )
}

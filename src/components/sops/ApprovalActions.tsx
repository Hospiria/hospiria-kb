'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, MessageSquare } from 'lucide-react'

interface Props {
  sopId: string
  approvalId: string | null
  authorId: string | null
  sopTitle: string
}

export function ApprovalActions({ sopId, approvalId, authorId, sopTitle }: Props) {
  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [action, setAction] = useState<'rejected' | 'changes_requested' | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleApprove() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const newVersion = await getNextVersion()

      // Save version snapshot
      const { data: sop } = await supabase.from('sops').select('content, current_version').eq('id', sopId).single()
      if (sop?.content) {
        await supabase.from('sop_versions').insert({
          sop_id: sopId,
          content: sop.content,
          version_number: newVersion,
          created_by: user?.id,
        })
      }

      // Update SOP to live
      await supabase.from('sops').update({ status: 'live', current_version: newVersion }).eq('id', sopId)

      // Update approval record
      if (approvalId) {
        await supabase.from('approvals').update({ status: 'approved', approver_id: user?.id }).eq('id', approvalId)
      }

      // Notify author
      if (authorId) {
        await supabase.from('notifications').insert({
          user_id: authorId,
          type: 'sop_approved',
          message: `Your SOP "${sopTitle}" has been approved and is now live!`,
          link: `/sops/${sopId}`,
        })
      }

      // Notify all agents with access to the teams this SOP belongs to
      const { data: sopTeams } = await supabase.from('sop_teams').select('team_id').eq('sop_id', sopId)
      if (sopTeams) {
        for (const { team_id } of sopTeams) {
          const { data: agents } = await supabase
            .from('profiles')
            .select('id')
            .eq('primary_team_id', team_id)
            .eq('role', 'agent')
          if (agents) {
            for (const agent of agents) {
              await supabase.from('notifications').insert({
                user_id: agent.id,
                type: 'sop_published',
                message: `New SOP published: "${sopTitle}"`,
                link: `/sops/${sopId}`,
              })
            }
          }
        }
      }

      router.push(`/sops/${sopId}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDecline(status: 'rejected' | 'changes_requested') {
    if (!comment.trim()) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('sops').update({ status: status === 'rejected' ? 'draft' : 'changes_requested' }).eq('id', sopId)

      if (approvalId) {
        await supabase.from('approvals').update({ status, comment, approver_id: user?.id }).eq('id', approvalId)
      }

      if (authorId) {
        const msg = status === 'rejected'
          ? `Your SOP "${sopTitle}" was rejected. Comment: ${comment}`
          : `Changes requested on "${sopTitle}": ${comment}`
        await supabase.from('notifications').insert({
          user_id: authorId,
          type: status,
          message: msg,
          link: `/sops/${sopId}`,
        })
      }

      router.push(`/sops/${sopId}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function getNextVersion(): Promise<number> {
    const { data } = await supabase.from('sops').select('current_version').eq('id', sopId).single()
    return (data?.current_version ?? 0) + 1
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <h2 className="font-semibold text-navy-700 mb-4">Your Decision</h2>

      {showComment ? (
        <div className="space-y-3">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={`Leave a comment for the author explaining your ${action === 'rejected' ? 'rejection' : 'requested changes'}…`}
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => action && handleDecline(action)}
              disabled={!comment.trim() || loading}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                action === 'rejected'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {loading ? 'Submitting…' : action === 'rejected' ? 'Confirm Rejection' : 'Request Changes'}
            </button>
            <button
              onClick={() => { setShowComment(false); setAction(null); setComment('') }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            Approve & Publish
          </button>
          <button
            onClick={() => { setAction('changes_requested'); setShowComment(true) }}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Request Changes
          </button>
          <button
            onClick={() => { setAction('rejected'); setShowComment(true) }}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

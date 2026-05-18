export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { FileText, Clock, CheckCircle, Users, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const session = await getEffectiveSession()
  if (!session || !session.profile) redirect('/login')

  const { profile, effectiveUserId } = session
  const role = profile.role

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-navy-700 tracking-tight">
          Welcome back, {profile.full_name?.split(' ')[0] ?? 'there'} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1 font-medium">
          {profile.teams?.name ? `${profile.teams.name} · ` : ''} Hospiria Knowledge Base
        </p>
      </div>

      {role === 'super_admin' && <SuperAdminDashboard userId={effectiveUserId} />}
      {role === 'approver' && <ApproverDashboard userId={effectiveUserId} />}
      {role === 'author' && <AuthorDashboard userId={effectiveUserId} />}
      {role === 'agent' && <AgentDashboard profile={profile} />}
    </div>
  )
}

async function SuperAdminDashboard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [{ count: totalSops }, { count: pending }, { count: totalUsers }, { data: recentSops }] = await Promise.all([
    supabase.from('sops').select('*', { count: 'exact', head: true }),
    supabase.from('sops').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('sops').select('*, categories(name), profiles(full_name)').order('updated_at', { ascending: false }).limit(5),
  ])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={FileText} label="Total SOPs" value={totalSops ?? 0} color="navy" />
        <StatCard icon={Clock} label="Pending Review" value={pending ?? 0} color="amber" href="/sops?status=submitted" />
        <StatCard icon={Users} label="Total Users" value={totalUsers ?? 0} color="teal" href="/admin/users" />
      </div>
      <RecentSopsTable sops={recentSops ?? []} title="Recent SOPs" />
    </div>
  )
}

async function ApproverDashboard({ userId }: { userId: string }) {
  const supabase = createClient()
  const { data: pending } = await supabase
    .from('sops')
    .select('*, categories(name), profiles(full_name)')
    .eq('status', 'submitted')
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
        <Clock className="w-8 h-8 text-amber-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-amber-800">{pending?.length ?? 0} SOP{(pending?.length ?? 0) !== 1 ? 's' : ''} awaiting review</p>
          <p className="text-sm text-amber-600">Review and approve submitted SOPs below</p>
        </div>
      </div>
      <RecentSopsTable sops={pending ?? []} title="SOPs Awaiting Review" showApproveLink />
    </div>
  )
}

async function AuthorDashboard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [{ data: drafts }, { data: submitted }, { data: approved }] = await Promise.all([
    supabase.from('sops').select('*, categories(name)').eq('author_id', userId).eq('status', 'draft').order('updated_at', { ascending: false }).limit(5),
    supabase.from('sops').select('*, categories(name)').eq('author_id', userId).in('status', ['submitted', 'changes_requested']).order('updated_at', { ascending: false }).limit(5),
    supabase.from('sops').select('*, categories(name)').eq('author_id', userId).eq('status', 'live').order('updated_at', { ascending: false }).limit(5),
  ])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={FileText} label="My Drafts" value={drafts?.length ?? 0} color="navy" />
        <StatCard icon={Clock} label="Under Review" value={submitted?.length ?? 0} color="amber" />
        <StatCard icon={CheckCircle} label="Live SOPs" value={approved?.length ?? 0} color="teal" />
      </div>
      {drafts && drafts.length > 0 && <RecentSopsTable sops={drafts} title="My Drafts" />}
      {submitted && submitted.length > 0 && <RecentSopsTable sops={submitted} title="Under Review" />}
    </div>
  )
}

async function AgentDashboard({ profile }: { profile: { primary_team_id: string | null; teams?: { name: string } | null } }) {
  const supabase = createClient()
  const { data: recent } = await supabase
    .from('sops')
    .select('*, categories(name), profiles(full_name), sop_teams!inner(team_id)')
    .eq('status', 'live')
    .eq('sop_teams.team_id', profile.primary_team_id ?? '')
    .order('updated_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
        <p className="font-semibold text-teal-800">
          {profile.teams?.name ?? 'Your Team'} — {recent?.length ?? 0} live SOP{(recent?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <p className="text-sm text-teal-600 mt-0.5">Browse all SOPs for your team</p>
        <Link href="/sops" className="mt-3 inline-block text-sm text-teal-700 font-medium hover:underline">
          View all SOPs →
        </Link>
      </div>
      <RecentSopsTable sops={recent ?? []} title="Recently Updated SOPs" />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  color: 'navy' | 'teal' | 'amber'
  href?: string
}) {
  const colorMap = {
    navy:  { icon: 'bg-navy-50 text-navy-600',  border: 'border-navy-100',  num: 'text-navy-700' },
    teal:  { icon: 'bg-teal-50 text-teal-600',  border: 'border-teal-100',  num: 'text-teal-700' },
    amber: { icon: 'bg-amber-50 text-amber-600', border: 'border-amber-100', num: 'text-amber-700' },
  }
  const c = colorMap[color]
  const card = (
    <div className={`bg-white border ${c.border} rounded-2xl p-5 ${href ? 'hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer' : ''}`}>
      <div className={`inline-flex p-2.5 rounded-xl mb-4 ${c.icon}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className={`text-4xl font-black tracking-tight ${c.num}`}>{value}</p>
      <p className="text-sm text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{card}</Link>
  return card
}

type SopWithJoins = {
  id: string
  title: string
  status: string
  updated_at: string
  categories?: { name: string } | null
  profiles?: { full_name: string | null } | null
}

function RecentSopsTable({ sops, title, showApproveLink }: { sops: SopWithJoins[]; title: string; showApproveLink?: boolean }) {
  if (sops.length === 0) return null
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-bold text-navy-700">{title}</h2>
        <span className="text-xs text-gray-400 font-medium">{sops.length} items</span>
      </div>
      <div className="divide-y divide-gray-50">
        {sops.map(sop => (
          <Link
            key={sop.id}
            href={showApproveLink ? `/sops/${sop.id}/approve` : `/sops/${sop.id}`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group"
          >
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-semibold text-navy-700 group-hover:text-teal-600 transition-colors truncate">
                {sop.title}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">
                {sop.categories?.name ?? 'Uncategorised'} · {formatDate(sop.updated_at)}
              </p>
            </div>
            <StatusBadge status={sop.status as import('@/types').SopStatus} />
          </Link>
        ))}
      </div>
    </div>
  )
}

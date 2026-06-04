'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  SlidersHorizontal, X, CheckCircle2, Clock, AlertTriangle,
  FileText, GraduationCap, StickyNote, Users, TrendingUp,
  ListChecks, ChevronRight, Pin, RotateCcw,
} from 'lucide-react'
import type { MemberChase, TeamQuizStat } from '@/app/(app)/dashboard/page'
import type { Profile } from '@/types'

// ─── Card catalogue ───────────────────────────────────────────────────────────

type CardKey =
  | 'tasks_today'     // My open tasks (due today + overdue)
  | 'sops_approve'    // SOPs waiting for my approval
  | 'team_chase'      // Team members with overdue quizzes
  | 'quiz_team'       // Team quiz completion stats
  | 'my_notes'        // My recent/pinned notes
  | 'my_courses'      // My pending quiz enrollments
  | 'team_sops'       // Recent live SOPs for the team
  | 'my_sops'         // My own SOPs

const CARD_CATALOGUE: {
  key: CardKey; label: string; description: string; icon: typeof Clock; roles: string[]
}[] = [
  { key: 'tasks_today', label: 'My Tasks Today',       description: 'Open to-dos due today or overdue',    icon: ListChecks,   roles: ['team_leader','junior_team_leader','approver','agent'] },
  { key: 'sops_approve', label: 'SOPs to Approve',      description: 'Submitted SOPs waiting for review',   icon: Clock,        roles: ['team_leader','approver'] },
  { key: 'team_chase',   label: 'Chase Up',             description: 'Team members with overdue quizzes',   icon: AlertTriangle, roles: ['team_leader','approver'] },
  { key: 'quiz_team',    label: 'Quiz Performance',     description: 'Team quiz completion rates',          icon: TrendingUp,   roles: ['team_leader','approver'] },
  { key: 'my_notes',     label: 'My Notes',             description: 'Your pinned and recent notes',        icon: StickyNote,   roles: ['team_leader','junior_team_leader','approver','agent'] },
  { key: 'my_courses',   label: 'My Courses',           description: 'Quizzes pending or failed',          icon: GraduationCap, roles: ['team_leader','junior_team_leader','approver','agent'] },
  { key: 'team_sops',    label: 'Team SOPs',            description: 'Latest live SOPs for your team',     icon: FileText,     roles: ['team_leader','junior_team_leader','approver','agent'] },
  { key: 'my_sops',      label: 'My SOPs',              description: 'SOPs you have written',              icon: FileText,     roles: ['team_leader','junior_team_leader','approver'] },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  myTasks: Record<string, unknown>[]
  sopsPending: Record<string, unknown>[]
  membersToChase: MemberChase[]
  teamQuizStats: TeamQuizStat[]
  teamSops: Record<string, unknown>[]
  myNotes: Record<string, unknown>[]
  myCourses: Record<string, unknown>[]
  mySops: Record<string, unknown>[]
  teamName: string | null
}

interface Props {
  profile: Profile
  role: string
  hiddenCards: string[]
  userId: string
  data: DashboardData
  adminChildren?: React.ReactNode
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardGrid({ profile, role, hiddenCards: initialHidden, userId, data, adminChildren }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden))
  const [customising, setCustomising] = useState(false)
  const [saving, setSaving] = useState(false)

  const availableCards = CARD_CATALOGUE.filter(c => c.roles.includes(role))

  const toggleCard = useCallback(async (key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setSaving(true)
    const next = new Set(hidden)
    next.has(key) ? next.delete(key) : next.add(key)
    await fetch('/api/dashboard/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden_cards: [...next] }),
    })
    setSaving(false)
  }, [hidden])

  const show = (key: CardKey) => availableCards.some(c => c.key === key) && !hidden.has(key)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-navy-700 tracking-tight">
            Welcome back, {profile.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1 font-medium">
            {data.teamName ? `${data.teamName} · ` : ''}Hospiria Knowledge Base
          </p>
        </div>
        {availableCards.length > 0 && (
          <button onClick={() => setCustomising(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${customising ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            <SlidersHorizontal className="w-4 h-4" />
            Customise{saving ? '…' : ''}
          </button>
        )}
      </div>

      {/* Customise panel */}
      {customising && availableCards.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
          <p className="text-sm font-semibold text-navy-700 mb-3">Choose which cards to show</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {availableCards.map(card => {
              const visible = !hidden.has(card.key)
              return (
                <button key={card.key} onClick={() => toggleCard(card.key)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${visible ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                  <card.icon className={`w-4 h-4 flex-shrink-0 ${visible ? 'text-teal-600' : 'text-gray-400'}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${visible ? 'text-teal-800' : 'text-gray-500'}`}>{card.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{card.description}</p>
                  </div>
                  {visible && <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 ml-auto" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Super admin: show original rich dashboard first */}
      {role === 'super_admin' && adminChildren && (
        <div className="mb-6">{adminChildren}</div>
      )}

      {/* Cards grid */}
      <div className="space-y-5">

        {/* Tasks today */}
        {show('tasks_today') && (
          <TasksTodayCard tasks={data.myTasks} today={today} />
        )}

        {/* SOPs to approve */}
        {show('sops_approve') && data.sopsPending.length > 0 && (
          <SopsApproveCard sops={data.sopsPending} />
        )}

        {/* Two-col row: quiz stats + chase */}
        {(show('quiz_team') || show('team_chase')) && (
          <div className="grid md:grid-cols-2 gap-5">
            {show('quiz_team') && <QuizTeamCard stats={data.teamQuizStats} />}
            {show('team_chase') && <ChaseCard members={data.membersToChase} />}
          </div>
        )}

        {/* My courses */}
        {show('my_courses') && data.myCourses.length > 0 && (
          <MyCoursesCard courses={data.myCourses} />
        )}

        {/* Two-col row: notes + team sops */}
        {(show('my_notes') || show('team_sops')) && (
          <div className="grid md:grid-cols-2 gap-5">
            {show('my_notes') && <MyNotesCard notes={data.myNotes} />}
            {show('team_sops') && <TeamSopsCard sops={data.teamSops} teamName={data.teamName} />}
          </div>
        )}

        {/* My SOPs */}
        {show('my_sops') && data.mySops.length > 0 && (
          <MySopsCard sops={data.mySops} />
        )}

        {/* Empty state */}
        {availableCards.every(c => hidden.has(c.key)) && (
          <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
            <p className="text-gray-400 text-sm">All cards are hidden.</p>
            <button onClick={() => setHidden(new Set())} className="mt-2 text-sm text-teal-600 hover:underline flex items-center gap-1 mx-auto">
              <RotateCcw className="w-3.5 h-3.5" /> Restore all cards
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card components ──────────────────────────────────────────────────────────

function CardShell({ title, icon: Icon, count, href, color = 'teal', children }: {
  title: string; icon: typeof Clock; count?: number; href?: string; color?: 'teal'|'amber'|'red'|'navy'; children: React.ReactNode
}) {
  const colors = {
    teal:  'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    red:   'bg-red-50 text-red-600',
    navy:  'bg-navy-50 text-navy-600',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${colors[color]}`}><Icon className="w-4 h-4" /></div>
          <h2 className="font-bold text-navy-700 text-sm">{title}</h2>
          {count !== undefined && <span className="text-xs text-gray-400 font-medium">({count})</span>}
        </div>
        {href && <Link href={href} className="text-xs text-teal-600 hover:underline font-medium">View all</Link>}
      </div>
      <div>{children}</div>
    </div>
  )
}

// Tasks today
type TodoRow = { id: string; title: string; due_date: string | null; priority: string; is_done: boolean; is_carry: boolean; status: string }

function TasksTodayCard({ tasks, today }: { tasks: Record<string, unknown>[]; today: string }) {
  const rows = tasks as TodoRow[]
  const overdue = rows.filter(t => t.due_date && t.due_date < today)
  const dueToday = rows.filter(t => t.due_date === today)
  const upcoming = rows.filter(t => !t.due_date || t.due_date > today)
  const PRIORITY_COLOR: Record<string, string> = { high: 'text-red-500', medium: 'text-amber-500', low: 'text-gray-300' }

  if (rows.length === 0) return (
    <CardShell title="My Tasks" icon={ListChecks} href="/notes" color="teal">
      <p className="text-sm text-gray-400 italic px-5 py-4">No open tasks. <Link href="/notes" className="text-teal-600 hover:underline">Go to Notes & To-dos →</Link></p>
    </CardShell>
  )

  return (
    <CardShell title="My Tasks" icon={ListChecks} count={rows.length} href="/notes" color={overdue.length > 0 ? 'red' : 'teal'}>
      {overdue.length > 0 && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs font-semibold text-red-600 mb-1.5">⚠️ Overdue ({overdue.length})</p>
          {overdue.slice(0, 3).map(t => <TaskRow key={t.id} t={t} priorityColor={PRIORITY_COLOR} />)}
        </div>
      )}
      {dueToday.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-50">
          <p className="text-xs font-semibold text-amber-600 mb-1.5">📅 Due today ({dueToday.length})</p>
          {dueToday.slice(0, 3).map(t => <TaskRow key={t.id} t={t} priorityColor={PRIORITY_COLOR} />)}
        </div>
      )}
      {upcoming.slice(0, 4).map(t => <TaskRow key={t.id} t={t} priorityColor={PRIORITY_COLOR} />)}
      {rows.length > 7 && (
        <Link href="/notes" className="block text-center text-xs text-gray-400 hover:text-teal-600 py-2 border-t border-gray-50">
          +{rows.length - 7} more — view all →
        </Link>
      )}
    </CardShell>
  )
}

function TaskRow({ t, priorityColor }: { t: TodoRow; priorityColor: Record<string, string> }) {
  return (
    <Link href="/notes" key={t.id} className="flex items-center gap-2.5 py-2 hover:bg-gray-50 -mx-5 px-5 group">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'}`} />
      <span className="text-sm text-navy-700 flex-1 truncate group-hover:text-teal-600">{t.title}</span>
      {t.is_carry && <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded flex-shrink-0">DUE</span>}
      <span className={`text-[11px] flex-shrink-0 font-medium ${priorityColor[t.priority]}`}>{t.priority}</span>
    </Link>
  )
}

// SOPs to approve
type SopRow = { id: string; title: string; updated_at: string; profiles?: { full_name: string | null } | null; categories?: { name: string } | null }

function SopsApproveCard({ sops }: { sops: Record<string, unknown>[] }) {
  const rows = sops as SopRow[]
  return (
    <CardShell title="SOPs to Approve" icon={Clock} count={rows.length} color="amber">
      <div className="divide-y divide-gray-50">
        {rows.slice(0, 6).map(s => (
          <Link key={s.id} href={`/sops/${s.id}/approve`}
            className="flex items-center justify-between px-5 py-3 hover:bg-amber-50 group">
            <div className="min-w-0 flex-1 mr-3">
              <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-amber-700">{s.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                By {s.profiles?.full_name ?? 'Unknown'} · {s.categories?.name ?? 'Uncategorised'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </CardShell>
  )
}

// Team quiz stats
function QuizTeamCard({ stats }: { stats: TeamQuizStat[] }) {
  if (stats.length === 0) return (
    <CardShell title="Quiz Performance" icon={TrendingUp} color="teal">
      <p className="text-sm text-gray-400 italic px-5 py-4">No quiz data yet.</p>
    </CardShell>
  )
  return (
    <CardShell title="Quiz Performance" icon={TrendingUp} color="teal">
      <div className="px-5 py-3 space-y-3">
        {stats.map(s => {
          const pct = s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0
          return (
            <div key={s.title}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-navy-700 truncate max-w-[70%]">{s.title}</p>
                <span className={`text-xs font-bold ${pct >= 80 ? 'text-teal-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-teal-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.passed} passed · {s.pending} pending · {s.failed} failed</p>
            </div>
          )
        })}
      </div>
    </CardShell>
  )
}

// Chase up members
function ChaseCard({ members }: { members: MemberChase[] }) {
  if (members.length === 0) return (
    <CardShell title="Chase Up" icon={AlertTriangle} color="amber">
      <p className="text-sm text-gray-400 italic px-5 py-4">✅ No overdue quizzes for your team!</p>
    </CardShell>
  )
  return (
    <CardShell title="Chase Up" icon={AlertTriangle} count={members.length} color="amber">
      <div className="divide-y divide-gray-50">
        {members.slice(0, 6).map(m => (
          <div key={m.id} className="flex items-start gap-3 px-5 py-3">
            <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <span className="text-amber-700 text-xs font-bold">{(m.name[0] ?? '?').toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy-700 truncate">{m.name}</p>
              <p className="text-xs text-gray-400 truncate">{m.quizTitle}</p>
              <p className="text-xs text-red-500 font-medium">Due: {m.dueDate}</p>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

// My courses
type CourseRow = { id: string; status: string; score: number | null; due_date: string | null; quizzes: { id: string; title: string; sops: { id: string; title: string } | null } | null }

function MyCoursesCard({ courses }: { courses: Record<string, unknown>[] }) {
  const rows = courses as CourseRow[]
  return (
    <CardShell title="My Courses" icon={GraduationCap} count={rows.length} href="/quizzes" color="navy">
      <div className="divide-y divide-gray-50">
        {rows.slice(0, 5).map(c => (
          <Link key={c.id} href="/quizzes"
            className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 group">
            <div className="min-w-0 flex-1 mr-3">
              <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{c.quizzes?.title ?? 'Quiz'}</p>
              {c.due_date && <p className="text-xs text-gray-400 mt-0.5">Due: {c.due_date}</p>}
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${c.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {c.status === 'failed' ? 'Retry' : 'Pending'}
            </span>
          </Link>
        ))}
      </div>
    </CardShell>
  )
}

// My notes
type NoteRow = { id: string; title: string; body: string | null; pinned: boolean; updated_at: string; sop_id: string | null }

function MyNotesCard({ notes }: { notes: Record<string, unknown>[] }) {
  const rows = notes as NoteRow[]
  return (
    <CardShell title="My Notes" icon={StickyNote} href="/notes" color="teal">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic px-5 py-4">No notes yet. <Link href="/notes" className="text-teal-600 hover:underline">Create one →</Link></p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(n => (
            <Link key={n.id} href="/notes" className="flex items-start gap-2.5 px-5 py-3 hover:bg-teal-50 group">
              {n.pinned && <Pin className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{n.title || 'Untitled'}</p>
                {n.body && <p className="text-xs text-gray-400 truncate">{n.body.slice(0, 80)}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// Team SOPs
type TeamSopRow = { id: string; title: string; status: string; updated_at: string; profiles?: { full_name: string | null } | null }

function TeamSopsCard({ sops, teamName }: { sops: Record<string, unknown>[]; teamName: string | null }) {
  const rows = sops as TeamSopRow[]
  return (
    <CardShell title={`${teamName ?? 'Team'} SOPs`} icon={FileText} href="/sops" color="navy">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic px-5 py-4">No SOPs yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(s => (
            <Link key={s.id} href={`/sops/${s.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 group">
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">Updated {new Date(s.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// My SOPs
type MySopRow = { id: string; title: string; status: string; updated_at: string; categories?: { name: string } | null }

function MySopsCard({ sops }: { sops: Record<string, unknown>[] }) {
  const rows = sops as MySopRow[]
  const statusColor: Record<string, string> = { live: 'bg-teal-100 text-teal-700', draft: 'bg-gray-100 text-gray-600', submitted: 'bg-amber-100 text-amber-700' }
  return (
    <CardShell title="My SOPs" icon={FileText} href="/sops" color="navy">
      <div className="divide-y divide-gray-50">
        {rows.map(s => (
          <Link key={s.id} href={`/sops/${s.id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 group">
            <div className="min-w-0 flex-1 mr-3">
              <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{s.title}</p>
              <p className="text-xs text-gray-400">{s.categories?.name ?? 'Uncategorised'}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusColor[s.status] ?? 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
          </Link>
        ))}
      </div>
    </CardShell>
  )
}

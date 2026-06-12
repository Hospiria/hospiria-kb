'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { AlertTriangle, Users, CheckCircle, Clock, XCircle, TrendingUp, FileText } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface EnrollmentRow {
  id: string; quiz_id: string; user_id: string
  status: 'pending' | 'passed' | 'failed'
  score: number | null; completed_at: string | null; due_date: string
}
interface QuizRow    { id: string; title: string }
interface TeamRow    { id: string; name: string }
interface ProfileRow { id: string; full_name: string | null; primary_team_id: string | null; role: string }

interface Props {
  enrollments: EnrollmentRow[]
  quizzes: QuizRow[]
  teams: TeamRow[]
  profiles: ProfileRow[]
  liveSops: number
  pendingSops: number
  totalUsers: number
}

const TEAL  = '#14b8a6'
const NAVY  = '#1e3a5f'
const AMBER = '#f59e0b'
const RED   = '#ef4444'
const SLATE = '#94a3b8'

function pct(n: number, d: number) { return d === 0 ? 0 : Math.round((n / d) * 100) }

// ─── Main ─────────────────────────────────────────────────────────────────────
export function AdminDashboardClient({ enrollments, quizzes, teams, profiles, liveSops, pendingSops, totalUsers }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>('all')

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredProfiles = useMemo(
    () => selectedTeam === 'all' ? profiles : profiles.filter(p => p.primary_team_id === selectedTeam),
    [profiles, selectedTeam]
  )
  const filteredMemberIds = useMemo(() => new Set(filteredProfiles.map(p => p.id)), [filteredProfiles])
  const filteredEnrollments = useMemo(
    () => selectedTeam === 'all' ? enrollments : enrollments.filter(e => filteredMemberIds.has(e.user_id)),
    [enrollments, filteredMemberIds, selectedTeam]
  )

  // ── Summary numbers ────────────────────────────────────────────────────────
  const completed = filteredEnrollments.filter(e => e.status !== 'pending')
  const passed    = filteredEnrollments.filter(e => e.status === 'passed')
  const failed    = filteredEnrollments.filter(e => e.status === 'failed')
  const pending   = filteredEnrollments.filter(e => e.status === 'pending')
  const passRate  = pct(passed.length, completed.length)

  // ── Score distribution (filtered) ─────────────────────────────────────────
  const scoreBuckets = [
    { label: '0–49%',  min: 0,  max: 49  },
    { label: '50–59%', min: 50, max: 59  },
    { label: '60–69%', min: 60, max: 69  },
    { label: '70–79%', min: 70, max: 79  },
    { label: '80–89%', min: 80, max: 89  },
    { label: '90–100%',min: 90, max: 100 },
  ]
  const scoreDistribution = scoreBuckets.map(b => ({
    label: b.label,
    count: completed.filter(e => e.score !== null && e.score >= b.min && e.score <= b.max).length,
  }))

  // ── Course completion chart ────────────────────────────────────────────────
  // All teams view → grouped bar by team
  // Single team view → bar per course for that team
  const teamMap = new Map(teams.map(t => [t.id, t]))

  const teamCompletion = useMemo(() => teams.map(team => {
    const ids = new Set(profiles.filter(p => p.primary_team_id === team.id).map(p => p.id))
    const e = enrollments.filter(e => ids.has(e.user_id))
    return {
      name: team.name.length > 14 ? team.name.slice(0, 13) + '…' : team.name,
      fullName: team.name,
      Passed:  e.filter(e => e.status === 'passed').length,
      Failed:  e.filter(e => e.status === 'failed').length,
      Pending: e.filter(e => e.status === 'pending').length,
    }
  }).filter(t => t.Passed + t.Failed + t.Pending > 0), [teams, profiles, enrollments])

  const courseBreakdown = useMemo(() => quizzes.map(q => {
    const e = filteredEnrollments.filter(en => en.quiz_id === q.id)
    const p = e.filter(en => en.status === 'passed').length
    const f = e.filter(en => en.status === 'failed').length
    const pe = e.filter(en => en.status === 'pending').length
    if (p + f + pe === 0) return null
    const shortTitle = q.title.length > 28 ? q.title.slice(0, 27) + '…' : q.title
    return { name: shortTitle, fullTitle: q.title, Passed: p, Failed: f, Pending: pe }
  }).filter(Boolean) as { name: string; fullTitle: string; Passed: number; Failed: number; Pending: number }[], [quizzes, filteredEnrollments])

  // ── Quiz topic failure analysis (filtered) ─────────────────────────────────
  const quizStats = useMemo(() => quizzes.map(quiz => {
    const e = filteredEnrollments.filter(en => en.quiz_id === quiz.id)
    const p = e.filter(en => en.status === 'passed').length
    const f = e.filter(en => en.status === 'failed').length
    const completedCount = p + f
    const failRate = pct(f, completedCount)
    return { id: quiz.id, title: quiz.title, total: e.length, passed: p, failed: f, failRate, needsAttention: failRate >= 40 && completedCount >= 2 }
  }).filter(q => q.total > 0).sort((a, b) => b.failRate - a.failRate), [quizzes, filteredEnrollments])

  // ── Per-agent stats (filtered) ─────────────────────────────────────────────
  const userStats = useMemo(() => filteredProfiles
    .filter(p => p.primary_team_id !== null && !['super_admin', 'approver'].includes(p.role))
    .map(p => {
      const e = filteredEnrollments.filter(en => en.user_id === p.id)
      if (e.length === 0) return null
      const pas = e.filter(en => en.status === 'passed').length
      const fai = e.filter(en => en.status === 'failed').length
      const pen = e.filter(en => en.status === 'pending').length
      const scores = e.filter(en => en.score !== null).map(en => en.score as number)
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      const team = p.primary_team_id ? teamMap.get(p.primary_team_id) : null
      return { id: p.id, name: p.full_name ?? 'Unknown', team: team?.name ?? '—', total: e.length, passed: pas, failed: fai, pending: pen, avgScore }
    })
    .filter(Boolean)
    .sort((a, b) => (b!.total) - (a!.total)) as { id: string; name: string; team: string; total: number; passed: number; failed: number; pending: number; avgScore: number | null }[]
  , [filteredProfiles, filteredEnrollments, teamMap])

  // ── Re-enrollment count ────────────────────────────────────────────────────
  const reenrolled = (() => {
    const counts: Record<string, number> = {}
    filteredEnrollments.forEach(e => { counts[e.user_id] = (counts[e.user_id] ?? 0) + 1 })
    return Object.values(counts).filter(c => c > 1).length
  })()

  const selectedTeamName = selectedTeam === 'all' ? 'All Teams' : (teamMap.get(selectedTeam)?.name ?? '')

  return (
    <div className="space-y-6">

      {/* ── Top admin stats (global — always visible) ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live SOPs" value={liveSops} sub="Published & active" color="teal" icon={<FileText className="w-5 h-5" />} />
        <StatCard label="Pending Review" value={pendingSops} sub="Awaiting approval" color="amber" icon={<Clock className="w-5 h-5" />} href="/sops?status=submitted" />
        <StatCard label="Total Users" value={totalUsers} sub="All roles" color="navy" icon={<Users className="w-5 h-5" />} href="/admin/users" />
        <StatCard label="Overall Pass Rate" value={`${pct(enrollments.filter(e => e.status === 'passed').length, enrollments.filter(e => e.status !== 'pending').length)}%`}
          sub={`${enrollments.filter(e => e.status === 'passed').length} of ${enrollments.filter(e => e.status !== 'pending').length} completed`}
          color={pct(enrollments.filter(e => e.status === 'passed').length, enrollments.filter(e => e.status !== 'pending').length) >= 70 ? 'teal' : 'red'}
          icon={<TrendingUp className="w-5 h-5" />} />
      </div>

      {/* ── Team tab bar ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-teal-500" />
          <h2 className="font-bold text-navy-700 text-sm">Training Overview</h2>
          <span className="text-xs text-gray-400 ml-1">— filter by team to monitor performance</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ id: 'all', name: 'All Teams' }, ...teams].map(t => (
            <button key={t.id} onClick={() => setSelectedTeam(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedTeam === t.id
                  ? 'bg-navy-700 text-white border-navy-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-600'
              }`}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Team-scoped stat pills ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat label="Enrolled" value={filteredEnrollments.length} sub={selectedTeamName} color="navy" />
        <MiniStat label="Passed" value={passed.length} sub={`${passRate}% pass rate`} color="teal" />
        <MiniStat label="Failed" value={failed.length} sub="Need re-training" color="red" />
        <MiniStat label="Pending" value={pending.length} sub={`${reenrolled} re-enrolled`} color="amber" />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Score Distribution */}
        <ChartCard title="Score Distribution" subtitle={`How agents scored — ${selectedTeamName}`}>
          {completed.length === 0 ? <EmptyChart text="No completed quizzes" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [v, 'Agents']} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.label.startsWith('0') ? RED : entry.label.startsWith('5') ? AMBER : TEAL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Course completion — per course when team selected, per team when all */}
        {selectedTeam === 'all' ? (
          <ChartCard title="Completion by Team" subtitle="Quiz statuses broken down by team">
            {teamCompletion.length === 0 ? <EmptyChart text="No team data yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamCompletion} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Passed"  fill={TEAL}  radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Failed"  fill={RED}   radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pending" fill={SLATE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        ) : (
          <ChartCard title="Course Completion" subtitle={`Per-course breakdown — ${selectedTeamName}`}>
            {courseBreakdown.length === 0 ? <EmptyChart text="No courses assigned to this team" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={courseBreakdown} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTitle ?? label} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Passed"  fill={TEAL}  radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Failed"  fill={RED}   radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Pending" fill={SLATE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        )}
      </div>

      {/* ── Agent Performance (above Topic Failure) ───────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy-700">Agent Performance</h2>
            <p className="text-xs text-gray-400 mt-0.5">{selectedTeamName} · individual quiz stats per agent</p>
          </div>
          <span className="text-xs font-medium px-2 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-full">
            {userStats.length} agent{userStats.length !== 1 ? 's' : ''}
          </span>
        </div>
        {userStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No quiz activity for this selection</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/60">
                  <th className="px-5 py-3 text-left">Agent</th>
                  {selectedTeam === 'all' && <th className="px-4 py-3 text-left">Team</th>}
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">Passed</th>
                  <th className="px-4 py-3 text-center">Failed</th>
                  <th className="px-4 py-3 text-center">Pending</th>
                  <th className="px-4 py-3 text-center">Avg Score</th>
                  <th className="px-4 py-3 text-center">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {userStats.map(u => {
                  const completionPct = pct(u.passed + u.failed, u.total)
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-navy-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[10px] font-bold">{initials(u.name)}</span>
                          </div>
                          <span className="font-medium text-navy-700">{u.name}</span>
                        </div>
                      </td>
                      {selectedTeam === 'all' && <td className="px-4 py-3 text-gray-500 text-xs">{u.team}</td>}
                      <td className="px-4 py-3 text-center text-gray-600">{u.total}</td>
                      <td className="px-4 py-3 text-center">
                        {u.passed > 0 ? <span className="inline-flex items-center gap-0.5 text-teal-600 font-semibold"><CheckCircle className="w-3 h-3" />{u.passed}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.failed > 0 ? <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold"><XCircle className="w-3 h-3" />{u.failed}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.pending > 0 ? <span className="inline-flex items-center gap-0.5 text-amber-500 font-semibold"><Clock className="w-3 h-3" />{u.pending}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.avgScore !== null ? (
                          <span className={`font-bold text-sm ${u.avgScore >= 80 ? 'text-teal-600' : u.avgScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{u.avgScore}%</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full" style={{ width: `${completionPct}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{completionPct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Topic Failure Analysis ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy-700">Topic Failure Analysis</h2>
            <p className="text-xs text-gray-400 mt-0.5">{selectedTeamName} · quizzes with high fail rates may need in-person training</p>
          </div>
          <span className="text-xs font-medium px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {quizStats.filter(q => q.needsAttention).length} need attention
          </span>
        </div>
        {quizStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No quiz data for this selection</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/60">
                  <th className="px-5 py-3 text-left">Quiz / Topic</th>
                  <th className="px-4 py-3 text-center">Enrolled</th>
                  <th className="px-4 py-3 text-center">Passed</th>
                  <th className="px-4 py-3 text-center">Failed</th>
                  <th className="px-4 py-3 text-center">Fail Rate</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quizStats.map(q => (
                  <tr key={q.id} className={q.needsAttention ? 'bg-red-50/40' : ''}>
                    <td className="px-5 py-3.5 font-medium text-navy-700">{q.title}</td>
                    <td className="px-4 py-3.5 text-center text-gray-600">{q.total}</td>
                    <td className="px-4 py-3.5 text-center text-teal-600 font-semibold">{q.passed}</td>
                    <td className="px-4 py-3.5 text-center text-red-500 font-semibold">{q.failed}</td>
                    <td className="px-4 py-3.5 text-center"><FailRatePill rate={q.failRate} /></td>
                    <td className="px-4 py-3.5 text-center">
                      {q.needsAttention ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                          <AlertTriangle className="w-3 h-3" />In-person training
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function StatCard({ label, value, sub, color, icon, href }: {
  label: string; value: number | string; sub: string
  color: 'teal' | 'navy' | 'amber' | 'red'
  icon: React.ReactNode; href?: string
}) {
  const c = {
    teal:  { bg: 'bg-teal-50',  text: 'text-teal-600',  border: 'border-teal-100',  num: 'text-teal-700' },
    navy:  { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-100',  num: 'text-blue-900' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', num: 'text-amber-700' },
    red:   { bg: 'bg-red-50',   text: 'text-red-600',   border: 'border-red-100',   num: 'text-red-700'  },
  }[color]
  const inner = (
    <div className={`bg-white border ${c.border} rounded-2xl p-5 ${href ? 'hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer' : ''}`}>
      <div className={`inline-flex p-2.5 rounded-xl mb-4 ${c.bg} ${c.text}`}>{icon}</div>
      <p className={`text-4xl font-black tracking-tight ${c.num}`}>{value}</p>
      <p className="text-sm font-semibold text-gray-600 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
  if (href) return <a href={href}>{inner}</a>
  return inner
}

function MiniStat({ label, value, sub, color }: { label: string; value: number; sub: string; color: 'teal' | 'navy' | 'red' | 'amber' }) {
  const c = {
    teal:  'bg-teal-50  border-teal-100  text-teal-700',
    navy:  'bg-blue-50  border-blue-100  text-blue-900',
    red:   'bg-red-50   border-red-100   text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
  }[color]
  return (
    <div className={`border rounded-2xl p-4 flex flex-col gap-0.5 ${c}`}>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs opacity-70">{sub}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <h2 className="font-bold text-navy-700 text-sm">{title}</h2>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
  )
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-[220px] flex items-center justify-center"><p className="text-sm text-gray-300">{text}</p></div>
}

function FailRatePill({ rate }: { rate: number }) {
  const color = rate >= 60 ? 'bg-red-100 text-red-700' : rate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
  return <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{rate}%</span>
}

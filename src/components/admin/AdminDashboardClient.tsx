'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { AlertTriangle, TrendingDown, Users, CheckCircle, Clock, XCircle } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────
interface EnrollmentRow {
  id: string
  quiz_id: string
  user_id: string
  status: 'pending' | 'passed' | 'failed'
  score: number | null
  completed_at: string | null
  due_date: string
}
interface QuizRow { id: string; title: string }
interface TeamRow { id: string; name: string }
interface ProfileRow { id: string; full_name: string | null; primary_team_id: string | null }

interface Props {
  enrollments: EnrollmentRow[]
  quizzes: QuizRow[]
  teams: TeamRow[]
  profiles: ProfileRow[]
  liveSops: number
  pendingSops: number
  totalUsers: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TEAL   = '#14b8a6'
const NAVY   = '#0f1f40'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const SLATE  = '#94a3b8'

function pct(n: number, d: number) {
  if (d === 0) return 0
  return Math.round((n / d) * 100)
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function AdminDashboardClient({ enrollments, quizzes, teams, profiles, liveSops, pendingSops, totalUsers }: Props) {

  // ── 1. Summary numbers ───────────────────────────────────────────────────
  const completed = enrollments.filter(e => e.status !== 'pending')
  const passed    = enrollments.filter(e => e.status === 'passed')
  const failed    = enrollments.filter(e => e.status === 'failed')
  const pending   = enrollments.filter(e => e.status === 'pending')
  const passRate  = pct(passed.length, completed.length)

  // ── 2. Score distribution ─────────────────────────────────────────────────
  const buckets = [
    { label: '0–49%',  min: 0,  max: 49  },
    { label: '50–59%', min: 50, max: 59  },
    { label: '60–69%', min: 60, max: 69  },
    { label: '70–79%', min: 70, max: 79  },
    { label: '80–89%', min: 80, max: 89  },
    { label: '90–100%',min: 90, max: 100 },
  ]
  const scoreDistribution = buckets.map(b => ({
    label: b.label,
    count: completed.filter(e => e.score !== null && e.score >= b.min && e.score <= b.max).length,
  }))

  // ── 3. Team completion ────────────────────────────────────────────────────
  const profileMap = new Map(profiles.map(p => [p.id, p]))
  const teamCompletion = teams.map(team => {
    const teamUserIds = new Set(profiles.filter(p => p.primary_team_id === team.id).map(p => p.id))
    const teamEnrollments = enrollments.filter(e => teamUserIds.has(e.user_id))
    return {
      name: team.name.length > 14 ? team.name.slice(0, 13) + '…' : team.name,
      fullName: team.name,
      Passed:  teamEnrollments.filter(e => e.status === 'passed').length,
      Failed:  teamEnrollments.filter(e => e.status === 'failed').length,
      Pending: teamEnrollments.filter(e => e.status === 'pending').length,
    }
  }).filter(t => t.Passed + t.Failed + t.Pending > 0)

  // ── 4. Topic failure analysis ─────────────────────────────────────────────
  const quizMap = new Map(quizzes.map(q => [q.id, q]))
  const quizStats = quizzes.map(quiz => {
    const e = enrollments.filter(en => en.quiz_id === quiz.id)
    const p = e.filter(en => en.status === 'passed').length
    const f = e.filter(en => en.status === 'failed').length
    const total = e.length
    const completedCount = p + f
    const failRate = pct(f, completedCount)
    return { id: quiz.id, title: quiz.title, total, passed: p, failed: f, failRate, needsAttention: failRate >= 40 && completedCount >= 2 }
  })
    .filter(q => q.total > 0)
    .sort((a, b) => b.failRate - a.failRate)

  // ── 5. Per-user stats ─────────────────────────────────────────────────────
  const teamMap = new Map(teams.map(t => [t.id, t]))
  const userStats = profiles
    .filter(p => p.primary_team_id !== null)
    .map(p => {
      const e = enrollments.filter(en => en.user_id === p.id)
      const pas = e.filter(en => en.status === 'passed').length
      const fai = e.filter(en => en.status === 'failed').length
      const pen = e.filter(en => en.status === 'pending').length
      const scores = e.filter(en => en.score !== null).map(en => en.score as number)
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      const team = p.primary_team_id ? teamMap.get(p.primary_team_id) : null
      return { id: p.id, name: p.full_name ?? 'Unknown', team: team?.name ?? '—', total: e.length, passed: pas, failed: fai, pending: pen, avgScore }
    })
    .filter(u => u.total > 0)
    .sort((a, b) => (b.total) - (a.total))

  // ── 6. Re-enrollment counts ───────────────────────────────────────────────
  const reenrolled = (() => {
    const counts: Record<string, number> = {}
    enrollments.forEach(e => { counts[e.user_id] = (counts[e.user_id] ?? 0) + 1 })
    return Object.values(counts).filter(c => c > 1).length
  })()

  return (
    <div className="space-y-6">

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live SOPs" value={liveSops} sub="Published & active" color="teal" icon={<CheckCircle className="w-5 h-5" />} />
        <StatCard label="Pending Review" value={pendingSops} sub="Awaiting approval" color="amber" icon={<Clock className="w-5 h-5" />} href="/sops?status=submitted" />
        <StatCard label="Total Users" value={totalUsers} sub="All roles" color="navy" icon={<Users className="w-5 h-5" />} href="/admin/users" />
        <StatCard label="Quiz Pass Rate" value={`${passRate}%`} sub={`${passed.length} of ${completed.length} completed`} color={passRate >= 70 ? 'teal' : 'red'} icon={<TrendingDown className="w-5 h-5" />} />
      </div>

      {/* ── Quiz Summary Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <MiniStat label="Quizzes Passed" value={passed.length} color="teal" />
        <MiniStat label="Quizzes Failed" value={failed.length} color="red" />
        <MiniStat label="Re-enrolled Users" value={reenrolled} color="amber" />
      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Score Distribution */}
        <ChartCard title="Score Distribution" subtitle="How agents are scoring across all quizzes">
          {completed.length === 0 ? (
            <EmptyChart text="No completed quizzes yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [v, 'Agents']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.label.startsWith('0') ? RED : entry.label.startsWith('5') ? AMBER : TEAL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Team Completion */}
        <ChartCard title="Team Completion" subtitle="Quiz statuses broken down by team">
          {teamCompletion.length === 0 ? (
            <EmptyChart text="No team data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={teamCompletion} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Passed"  fill={TEAL}  radius={[4, 4, 0, 0]} />
                <Bar dataKey="Failed"  fill={RED}   radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pending" fill={SLATE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Topic Failure Analysis ──────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy-700">Topic Failure Analysis</h2>
            <p className="text-xs text-gray-400 mt-0.5">Quizzes with high fail rates may need in-person training</p>
          </div>
          <span className="text-xs font-medium px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {quizStats.filter(q => q.needsAttention).length} need attention
          </span>
        </div>
        {quizStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No quiz data yet</p>
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
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quizStats.map(q => (
                  <tr key={q.id} className={q.needsAttention ? 'bg-red-50/40' : ''}>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-navy-700">{q.title}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600">{q.total}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-teal-600 font-semibold">{q.passed}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-red-500 font-semibold">{q.failed}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <FailRatePill rate={q.failRate} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {q.needsAttention ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          In-person training
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

      {/* ── Per-User Stats ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-navy-700">Agent Performance</h2>
          <p className="text-xs text-gray-400 mt-0.5">Individual quiz stats per user</p>
        </div>
        {userStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No quiz activity yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/60">
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Team</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">Passed</th>
                  <th className="px-4 py-3 text-center">Failed</th>
                  <th className="px-4 py-3 text-center">Pending</th>
                  <th className="px-4 py-3 text-center">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {userStats.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-navy-700">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.team}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{u.total}</td>
                    <td className="px-4 py-3 text-center">
                      {u.passed > 0 ? <span className="text-teal-600 font-semibold">{u.passed}</span> : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.failed > 0 ? <span className="text-red-500 font-semibold">{u.failed}</span> : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.pending > 0 ? <span className="text-amber-500 font-semibold">{u.pending}</span> : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.avgScore !== null ? (
                        <span className={`font-semibold ${u.avgScore >= 70 ? 'text-teal-600' : u.avgScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                          {u.avgScore}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
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

function StatCard({
  label, value, sub, color, icon, href,
}: {
  label: string; value: number | string; sub: string
  color: 'teal' | 'navy' | 'amber' | 'red'
  icon: React.ReactNode; href?: string
}) {
  const colorMap = {
    teal:  { bg: 'bg-teal-50',  text: 'text-teal-600',  border: 'border-teal-100',  num: 'text-teal-700' },
    navy:  { bg: 'bg-navy-50',  text: 'text-navy-600',  border: 'border-navy-100',  num: 'text-navy-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', num: 'text-amber-700' },
    red:   { bg: 'bg-red-50',   text: 'text-red-600',   border: 'border-red-100',   num: 'text-red-700'  },
  }
  const c = colorMap[color]
  const inner = (
    <div className={`bg-white border ${c.border} rounded-2xl p-5 ${href ? 'hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer' : ''}`}>
      <div className={`inline-flex p-2.5 rounded-xl mb-4 ${c.bg} ${c.text}`}>
        {icon}
      </div>
      <p className={`text-4xl font-black tracking-tight ${c.num}`}>{value}</p>
      <p className="text-sm font-semibold text-gray-600 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
  if (href) return <a href={href}>{inner}</a>
  return inner
}

function MiniStat({ label, value, color }: { label: string; value: number; color: 'teal' | 'red' | 'amber' }) {
  const colorMap = {
    teal:  'bg-teal-50 border-teal-100 text-teal-700',
    red:   'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
  }
  return (
    <div className={`border rounded-2xl p-4 flex items-center justify-between ${colorMap[color]}`}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-2xl font-black">{value}</span>
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
  return (
    <div className="h-[220px] flex items-center justify-center">
      <p className="text-sm text-gray-300">{text}</p>
    </div>
  )
}

function FailRatePill({ rate }: { rate: number }) {
  const color = rate >= 60 ? 'bg-red-100 text-red-700' : rate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      {rate}%
    </span>
  )
}

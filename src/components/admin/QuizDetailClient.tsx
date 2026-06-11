'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, Users, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, RefreshCw, X, Search, AlertCircle, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { Quiz, QuizEnrollment, Profile } from '@/types'

interface Props {
  quiz: Quiz & { sops?: { id: string; title: string; categories?: { name: string; teams?: { name: string } } } }
  initialEnrollments: (QuizEnrollment & { profiles?: Profile })[]
  allProfiles: (Profile & { teams?: { id: string; name: string } })[]
}

export function QuizDetailClient({ quiz, initialEnrollments, allProfiles }: Props) {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState(initialEnrollments)
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [reenrollTarget, setReenrollTarget] = useState<{ userId: string; name: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dueDays, setDueDays] = useState(7)
  const [searchQuery, setSearchQuery] = useState('')
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [reenrollLoading, setReenrollLoading] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const stats = {
    total: enrollments.length,
    passed: enrollments.filter(e => e.status === 'passed').length,
    failed: enrollments.filter(e => e.status === 'failed').length,
    pending: enrollments.filter(e => e.status === 'pending').length,
  }

  // Latest enrollment per user for display (use due_date as fallback if enrolled_at not set)
  const enrollTimestamp = (e: QuizEnrollment) => e.enrolled_at ? new Date(e.enrolled_at).getTime() : new Date(e.due_date).getTime()
  const latestPerUser = new Map<string, QuizEnrollment & { profiles?: Profile }>()
  for (const e of enrollments) {
    const ex = latestPerUser.get(e.user_id)
    if (!ex || enrollTimestamp(e) > enrollTimestamp(ex)) latestPerUser.set(e.user_id, e)
  }
  const displayEnrollments = Array.from(latestPerUser.values())
    .filter(e => !filterStatus || e.status === filterStatus)
    .sort((a, b) => enrollTimestamp(b) - enrollTimestamp(a))

  // Already-enrolled user IDs (latest enrollment)
  const enrolledUserIds = new Set(Array.from(latestPerUser.values()).filter(e => e.status === 'pending').map(e => e.user_id))

  const filteredProfiles = allProfiles.filter(p =>
    !searchQuery || p.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  async function handleEnroll() {
    if (selectedIds.size === 0) return
    setEnrollLoading(true)
    try {
      const res = await fetch(`/api/admin/quizzes/${quiz.id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedIds), dueDays }),
      })
      if (res.ok) {
        const d = await res.json()
        // Immediately add new enrollments to local state — no second fetch needed
        if (d.enrollments?.length) {
          setEnrollments(prev => [...prev, ...d.enrollments])
        }
        setShowEnrollModal(false)
        setSelectedIds(new Set())
        router.refresh()
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Enrolment failed — please try again.')
      }
    } finally {
      setEnrollLoading(false)
    }
  }

  async function handleReenroll() {
    if (!reenrollTarget) return
    setReenrollLoading(true)
    try {
      const res = await fetch(`/api/admin/quizzes/${quiz.id}/reenroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: reenrollTarget.userId, dueDays }),
      })
      if (res.ok) {
        setReenrollTarget(null)
        // Reload full list from GET so re-enrolled user shows as pending
        const r2 = await fetch(`/api/admin/quizzes/${quiz.id}/enroll`)
        if (r2.ok) { const d = await r2.json(); setEnrollments(d.enrollments ?? []) }
        router.refresh()
      }
    } finally {
      setReenrollLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${quiz.title}"? This will remove the quiz and all ${stats.total} enrollment records. This cannot be undone.`)) return
    const res = await fetch(`/api/admin/quizzes/${quiz.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/admin/quizzes')
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Delete failed — please try again.')
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="w-5 h-5 text-teal-500" />
              <h1 className="text-xl font-bold text-navy-700">{quiz.title}</h1>
            </div>
            {quiz.sops && (
              <p className="text-sm text-gray-500">
                SOP:{' '}
                <Link href={`/sops/${quiz.sops.id}`} className="text-teal-600 hover:underline">
                  {quiz.sops.title}
                </Link>
                {quiz.sops.categories && (
                  <span className="text-gray-400"> · {quiz.sops.categories.teams?.name} · {quiz.sops.categories.name}</span>
                )}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">{quiz.questions.length} questions · Pass mark: {quiz.pass_mark}%</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEnrollModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Users className="w-4 h-4" />
              Enrol Users
            </button>
            <button
              onClick={handleDelete}
              title="Delete this quiz and all enrollments"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Quiz
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: 'Total Enrolled', value: stats.total, color: 'text-navy-700', bg: 'bg-gray-50' },
            { label: 'Passed', value: stats.passed, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Failed', value: stats.failed, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Pending', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Questions preview */}
      <div className="bg-white border border-gray-200 rounded-2xl mb-4 overflow-hidden">
        <button
          onClick={() => setShowQuestions(!showQuestions)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium text-navy-700 text-sm">Questions Preview ({quiz.questions.length})</span>
          {showQuestions ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {showQuestions && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {quiz.questions.map((q, idx) => (
              <div key={q.id} className="text-sm">
                <p className="font-medium text-navy-700"><span className="text-teal-500">Q{idx + 1}.</span> {q.question}</p>
                <div className="ml-4 mt-1 space-y-0.5">
                  {q.options.map((opt, i) => (
                    <p key={i} className={i === q.correct ? 'text-green-600 font-medium' : 'text-gray-400'}>
                      {i === q.correct ? '✓ ' : '  '}{opt}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrollments table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-navy-700">Enrollments</h2>
          <div className="flex gap-2">
            {['', 'pending', 'passed', 'failed'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${filterStatus === s ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
              </button>
            ))}
          </div>
        </div>

        {displayEnrollments.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No enrollments yet. Click &ldquo;Enrol Users&rdquo; to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">Due Date</th>
                <th className="text-left px-4 py-3 font-medium">Enrolled</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayEnrollments.map(e => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-navy-700">{e.profiles?.full_name ?? 'Unknown'}</td>
                  <td className="px-4 py-3">
                    {e.status === 'passed' && <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="w-3 h-3" />Passed</span>}
                    {e.status === 'failed' && <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle className="w-3 h-3" />Failed</span>}
                    {e.status === 'pending' && <span className="flex items-center gap-1 text-amber-600 text-xs"><Clock className="w-3 h-3" />Pending</span>}
                  </td>
                  <td className="px-4 py-3">{e.score !== null ? <span className="font-semibold">{e.score}%</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(e.due_date)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(e.enrolled_at)}</td>
                  <td className="px-4 py-3">
                    {(e.status === 'failed') && (
                      <button
                        onClick={() => { setReenrollTarget({ userId: e.user_id, name: e.profiles?.full_name ?? 'User' }); setDueDays(7) }}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-navy-700 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Re-enrol
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Enrol Users Modal ── */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-navy-700">Enrol Users</h3>
              <button onClick={() => { setShowEnrollModal(false); setSelectedIds(new Set()); setSearchQuery('') }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-100">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search users…"
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <label className="text-sm text-gray-600 flex items-center gap-2">
                <span>Due in</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={dueDays}
                  onChange={e => setDueDays(Number(e.target.value))}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <span>days</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredProfiles.map(p => {
                const isEnrolled = enrolledUserIds.has(p.id)
                const checked = selectedIds.has(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isEnrolled ? 'opacity-50' : 'hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isEnrolled}
                      onChange={() => toggleSelect(p.id)}
                      className="accent-teal-600 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-700">{p.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-gray-400">{p.role}{p.teams ? ` · ${p.teams.name}` : ''}</p>
                    </div>
                    {isEnrolled && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>}
                  </label>
                )
              })}
              {filteredProfiles.length === 0 && (
                <p className="text-center text-gray-400 py-6 text-sm">No users found</p>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
              <button
                onClick={handleEnroll}
                disabled={selectedIds.size === 0 || enrollLoading}
                className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {enrollLoading ? 'Enrolling…' : `Enrol ${selectedIds.size} User${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Re-enrol Confirm Modal ── */}
      {reenrollTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-navy-700">Re-enrol User</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Re-enrolling <strong>{reenrollTarget.name}</strong>. They will need to re-read the SOP and take the quiz again.
            </p>
            <label className="text-sm text-gray-600 flex items-center gap-2 mb-5">
              <span>Due in</span>
              <input
                type="number"
                min={1}
                max={90}
                value={dueDays}
                onChange={e => setDueDays(Number(e.target.value))}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span>days</span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleReenroll}
                disabled={reenrollLoading}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {reenrollLoading ? 'Re-enrolling…' : 'Confirm Re-enrol'}
              </button>
              <button onClick={() => setReenrollTarget(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

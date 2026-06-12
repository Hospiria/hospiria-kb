'use client'

import { useState, useEffect } from 'react'
import {
  GraduationCap, Users, CheckCircle, XCircle, Clock,
  X, Loader2, BookOpen, Search, Trash2, RefreshCw,
} from 'lucide-react'

interface TeamInfo { id: string; name: string }

interface Course {
  id: string
  title: string
  pass_mark: number
  sop_id: string | null
  enrolled: number
  passed: number
  failed: number
  pending: number
  completed: number
  passRate: number | null
  teams: TeamInfo[]
}

interface EnrollmentProfile {
  id: string
  full_name: string | null
  role: string
  primary_team_id: string | null
  teamName: string | null
}

interface Enrollment {
  id: string
  quiz_id: string
  user_id: string
  status: string
  score: number | null
  due_date: string
  enrolled_at: string
  profiles: EnrollmentProfile | null
}

type PanelTab = 'all' | 'pending' | 'failed'

function initials(name: string | null) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'passed')
    return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium"><CheckCircle className="w-3 h-3" />Passed</span>
  if (status === 'failed')
    return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium"><XCircle className="w-3 h-3" />Failed</span>
  return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium"><Clock className="w-3 h-3" />Pending</span>
}

// ─── Course card ──────────────────────────────────────────────────────────────

function CourseCard({ course, onClick, onDelete }: { course: Course; onClick: () => void; onDelete: () => void }) {
  const completionPct  = course.enrolled > 0 ? Math.round((course.completed / course.enrolled) * 100) : 0
  const passPct        = course.enrolled > 0 ? Math.round((course.passed   / course.enrolled) * 100) : 0
  const failPct        = course.enrolled > 0 ? Math.round((course.failed   / course.enrolled) * 100) : 0

  return (
    <div
      className="relative w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-sm transition-all group cursor-pointer"
      onClick={onClick}
    >
      {/* Delete button — visible on hover */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        title="Delete quiz"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 mb-3 pr-8">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy-700 group-hover:text-teal-600 transition-colors truncate">
            {course.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Pass mark: {course.pass_mark}%</p>
        </div>
        {course.passRate !== null && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
            course.passRate >= 80 ? 'bg-green-100 text-green-700'
            : course.passRate >= 60 ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
          }`}>
            {course.passRate}% pass rate
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
          <span>{completionPct}% completed</span>
          <span>{course.completed} / {course.enrolled} done</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full transition-all rounded-l-full" style={{ width: `${passPct}%` }} />
          <div className="bg-red-400 h-full transition-all" style={{ width: `${failPct}%` }} />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Passed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Failed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />Pending</span>
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-gray-500"><Users className="w-3 h-3" />{course.enrolled} enrolled</span>
        <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" />{course.passed} passed</span>
        <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{course.failed} failed</span>
        <span className="flex items-center gap-1 text-amber-500"><Clock className="w-3 h-3" />{course.pending} pending</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AllCoursesClient({ teams }: { teams: TeamInfo[] }) {
  const [courses, setCourses]         = useState<Course[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedCourse, setSelected] = useState<Course | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [tab, setTab]                 = useState<PanelTab>('all')
  const [search, setSearch]           = useState('')
  const [reenrolling, setReenrolling] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/courses')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCourses(d.courses ?? []) })
      .finally(() => setLoading(false))
  }, [])

  async function handleReenroll(userId: string) {
    if (!selectedCourse) return
    setReenrolling(prev => new Set(prev).add(userId))
    try {
      const res = await fetch(`/api/admin/quizzes/${selectedCourse.id}/reenroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, dueDays: 7 }),
      })
      if (res.ok) {
        // Refresh enrollment list
        const r2 = await fetch(`/api/admin/quizzes/${selectedCourse.id}/enroll`)
        if (r2.ok) { const d = await r2.json(); setEnrollments(d.enrollments ?? []) }
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Re-enrol failed — please try again.')
      }
    } finally {
      setReenrolling(prev => { const n = new Set(prev); n.delete(userId); return n })
    }
  }

  async function handleDeleteCourse(course: Course) {
    if (!confirm(`Delete "${course.title}"? This will remove the quiz and all ${course.enrolled} enrollment records. This cannot be undone.`)) return
    const res = await fetch(`/api/admin/quizzes/${course.id}`, { method: 'DELETE' })
    if (res.ok) {
      setCourses(prev => prev.filter(c => c.id !== course.id))
      if (selectedCourse?.id === course.id) setSelected(null)
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Delete failed — please try again.')
    }
  }

  async function openCourse(course: Course) {
    setSelected(course)
    setTab('all')
    setSearch('')
    setLoadingPanel(true)
    try {
      const r = await fetch(`/api/admin/quizzes/${course.id}/enroll`)
      if (r.ok) {
        const d = await r.json()
        setEnrollments(d.enrollments ?? [])
      }
    } finally {
      setLoadingPanel(false)
    }
  }

  // Group courses by team (a course can appear in multiple teams)
  const grouped: { team: TeamInfo | null; courses: Course[] }[] = []
  const placed = new Set<string>()
  for (const team of teams) {
    const tc = courses.filter(c => c.teams.some(t => t.id === team.id))
    if (tc.length > 0) {
      grouped.push({ team, courses: tc })
      tc.forEach(c => placed.add(c.id))
    }
  }
  const unassigned = courses.filter(c => !placed.has(c.id))
  if (unassigned.length > 0) grouped.push({ team: null, courses: unassigned })

  // Panel filtering
  const sq = search.toLowerCase()
  const filtered = enrollments.filter(e =>
    !sq || (e.profiles?.full_name ?? '').toLowerCase().includes(sq)
  )
  const tabRows =
    tab === 'pending' ? filtered.filter(e => e.status === 'pending')
    : tab === 'failed' ? filtered.filter(e => e.status === 'failed')
    : filtered

  const pendingCount = enrollments.filter(e => e.status === 'pending').length
  const failedCount  = enrollments.filter(e => e.status === 'failed').length

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="w-7 h-7 text-teal-500" />
        <div>
          <h1 className="text-2xl font-bold text-navy-700">All Courses</h1>
          <p className="text-gray-500 text-sm">
            {courses.length} course{courses.length !== 1 ? 's' : ''} across {teams.length} team{teams.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No courses yet</p>
          <p className="text-sm mt-1">Publish an SOP with quiz enabled to create a course</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ team, courses: gc }) => (
            <div key={team?.id ?? '__none__'}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 px-1">
                {team ? team.name : 'No Team Assigned'}
              </h2>
              <div className="grid gap-3">
                {gc.map(course => (
                  <CourseCard key={course.id} course={course} onClick={() => openCourse(course)} onDelete={() => handleDeleteCourse(course)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Slide-out detail panel ───────────────────────────────────────── */}
      {selectedCourse && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelected(null)} />

          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">

            {/* Panel header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Course details</p>
                <p className="text-sm font-semibold text-navy-700 leading-snug">{selectedCourse.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                  <span className="text-gray-400">{selectedCourse.enrolled} enrolled</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-green-600 font-medium">{selectedCourse.passed} passed</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-red-500 font-medium">{selectedCourse.failed} failed</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-amber-500 font-medium">{selectedCourse.pending} pending</span>
                  {selectedCourse.passRate !== null && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className={`font-bold ${selectedCourse.passRate >= 80 ? 'text-green-600' : selectedCourse.passRate >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                        {selectedCourse.passRate}% pass rate
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                <button
                  onClick={() => handleDeleteCourse(selectedCourse)}
                  title="Delete quiz"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setSelected(null)} className="p-1.5 text-gray-400 hover:text-navy-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tabs + search */}
            <div className="flex items-center gap-1.5 px-5 py-2 border-b border-gray-100 flex-shrink-0">
              {([
                ['all',     'All',     enrollments.length],
                ['pending', 'Pending', pendingCount],
                ['failed',  'Failed',  failedCount],
              ] as [PanelTab, string, number][]).map(([key, label, count]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    tab === key ? 'bg-navy-700 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  {label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    tab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>{count}</span>
                </button>
              ))}
              <div className="ml-auto relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-6 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 w-28"
                />
              </div>
            </div>

            {/* Enrollment list */}
            <div className="flex-1 overflow-y-auto">
              {loadingPanel ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : tabRows.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">
                  {tab === 'pending' ? 'Nobody pending — all done!' :
                   tab === 'failed'  ? 'Nobody failed this course' :
                   'No enrolments yet'}
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {tabRows.map(e => {
                    const name = e.profiles?.full_name ?? 'Unknown'
                    const teamLabel = e.profiles?.teamName ?? null
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-navy-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-[11px] font-bold">{initials(name)}</span>
                        </div>
                        {/* Name + team */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-navy-700 truncate">{name}</p>
                          {teamLabel && <p className="text-[11px] text-gray-400">{teamLabel}</p>}
                        </div>
                        {/* Status + score + re-send */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <StatusBadge status={e.status} />
                          {e.score !== null && (
                            <span className="text-[11px] font-bold text-gray-500">{e.score}%</span>
                          )}
                          {e.status === 'failed' && (
                            <button
                              onClick={() => handleReenroll(e.user_id)}
                              disabled={reenrolling.has(e.user_id)}
                              className="flex items-center gap-1 text-[10px] font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50 mt-0.5"
                            >
                              <RefreshCw className={`w-3 h-3 ${reenrolling.has(e.user_id) ? 'animate-spin' : ''}`} />
                              {reenrolling.has(e.user_id) ? 'Sending…' : 'Re-send'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

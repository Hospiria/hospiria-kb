export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

function getDueStatus(dueDate: string, status: string) {
  if (status !== 'pending') return null
  const due = new Date(dueDate)
  const now = new Date()
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { label: `Overdue by ${Math.abs(daysLeft)} days`, color: 'text-red-600' }
  if (daysLeft === 0) return { label: 'Due today', color: 'text-red-500' }
  if (daysLeft <= 2) return { label: `Due in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`, color: 'text-amber-600' }
  return { label: `Due in ${daysLeft} days`, color: 'text-gray-500' }
}

export default async function MyQuizzesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: enrollments } = await supabase
    .from('quiz_enrollments')
    .select('*, quizzes(id, title, pass_mark, sops(id, title))')
    .eq('user_id', user.id)
    .order('enrolled_at', { ascending: false })

  // Deduplicate: for each quiz, only show the latest enrollment
  const latestPerQuiz = new Map<string, typeof enrollments extends (infer T)[] | null ? T : never>()
  for (const e of (enrollments ?? []) as { quiz_id: string; enrolled_at: string }[]) {
    const existing = latestPerQuiz.get(e.quiz_id) as { enrolled_at: string } | undefined
    if (!existing || new Date(e.enrolled_at) > new Date(existing.enrolled_at)) {
      latestPerQuiz.set(e.quiz_id, e as never)
    }
  }
  const myEnrollments = Array.from(latestPerQuiz.values()) as {
    id: string
    quiz_id: string
    due_date: string
    status: string
    score: number | null
    enrolled_at: string
    quizzes: { id: string; title: string; pass_mark: number; sops: { id: string; title: string } }
  }[]

  const pending = myEnrollments.filter(e => e.status === 'pending')
  const completed = myEnrollments.filter(e => e.status !== 'pending')

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="w-7 h-7 text-teal-500" />
        <div>
          <h1 className="text-2xl font-bold text-navy-700">My Quizzes</h1>
          <p className="text-gray-500 text-sm">{pending.length} pending · {completed.length} completed</p>
        </div>
      </div>

      {myEnrollments.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No quizzes assigned yet</p>
        </div>
      )}

      {/* Pending quizzes */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">To Complete</h2>
          <div className="space-y-3">
            {pending.map(e => {
              const dueStatus = getDueStatus(e.due_date, e.status)
              const isOverdue = dueStatus?.color === 'text-red-600'
              return (
                <Link
                  key={e.id}
                  href={`/quizzes/${e.id}`}
                  className={`block p-5 bg-white border rounded-xl hover:shadow-sm transition-all group ${isOverdue ? 'border-red-200 hover:border-red-300' : 'border-gray-200 hover:border-teal-300'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy-700 group-hover:text-teal-600 transition-colors">{e.quizzes.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Read the SOP, then take the quiz · Pass mark: {e.quizzes.pass_mark}%</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`flex items-center gap-1 text-xs font-medium ${dueStatus?.color ?? 'text-gray-500'}`}>
                        {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {dueStatus?.label}
                      </span>
                      <span className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">Pending</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Completed quizzes */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Completed</h2>
          <div className="space-y-2">
            {completed.map(e => (
              <div
                key={e.id}
                className={`flex items-center justify-between p-4 bg-white border rounded-xl ${e.status === 'passed' ? 'border-green-100' : 'border-red-100'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy-700 truncate">{e.quizzes.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Completed {formatDate(e.enrolled_at)}</p>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <span className="text-sm font-bold text-navy-700">{e.score}%</span>
                  {e.status === 'passed' ? (
                    <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                      <CheckCircle className="w-3 h-3" /> Passed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                      <XCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, CheckCircle, Clock, AlertCircle, Zap } from 'lucide-react'
import { QuizGenerateAllButton } from '@/components/admin/QuizGenerateAllButton'

export default async function AdminQuizzesPage() {
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  // Get all live SOPs
  const { data: sops } = await adminClient
    .from('sops')
    .select('id, title, categories(name, teams(name))')
    .eq('status', 'live')
    .order('title')

  // Get all quizzes
  const { data: quizzes } = await adminClient
    .from('quizzes')
    .select('id, sop_id, created_at')

  // Get enrollment stats per quiz
  const { data: enrollments } = await adminClient
    .from('quiz_enrollments')
    .select('quiz_id, status')

  const quizMap = new Map((quizzes ?? []).map((q: { id: string; sop_id: string; created_at: string }) => [q.sop_id, q]))
  const enrollmentMap = new Map<string, { pending: number; passed: number; failed: number }>()

  for (const e of (enrollments ?? []) as { quiz_id: string; status: string }[]) {
    if (!enrollmentMap.has(e.quiz_id)) enrollmentMap.set(e.quiz_id, { pending: 0, passed: 0, failed: 0 })
    const stats = enrollmentMap.get(e.quiz_id)!
    if (e.status === 'pending') stats.pending++
    else if (e.status === 'passed') stats.passed++
    else if (e.status === 'failed') stats.failed++
  }

  const withQuiz = (sops ?? []).filter((s: { id: string }) => quizMap.has(s.id))
  const withoutQuiz = (sops ?? []).filter((s: { id: string }) => !quizMap.has(s.id))

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-teal-500" />
            Manage Quizzes
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {withQuiz.length} quizzes generated · {withoutQuiz.length} SOPs need quizzes
          </p>
        </div>
        <QuizGenerateAllButton missingCount={withoutQuiz.length} />
      </div>

      {/* SOPs without quizzes */}
      {withoutQuiz.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            No Quiz Yet ({withoutQuiz.length})
          </h2>
          <div className="space-y-2">
            {(withoutQuiz as unknown as { id: string; title: string; categories?: { name: string; teams?: { name: string } } }[]).map(sop => (
              <div key={sop.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
                <div>
                  <p className="font-medium text-navy-700">{sop.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sop.categories?.teams?.name} · {sop.categories?.name ?? 'Uncategorised'}
                  </p>
                </div>
                <QuizGenerateAllButton sopId={sop.id} sopTitle={sop.title} single />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SOPs with quizzes */}
      {withQuiz.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Quizzes Ready ({withQuiz.length})
          </h2>
          <div className="space-y-2">
            {(withQuiz as unknown as { id: string; title: string; categories?: { name: string; teams?: { name: string } } }[]).map(sop => {
              const quiz = quizMap.get(sop.id)!
              const stats = enrollmentMap.get(quiz.id) ?? { pending: 0, passed: 0, failed: 0 }
              const total = stats.pending + stats.passed + stats.failed

              return (
                <Link
                  key={sop.id}
                  href={`/admin/quizzes/${quiz.id}`}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <p className="font-medium text-navy-700 group-hover:text-teal-600 transition-colors truncate">{sop.title}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 ml-6">
                      {sop.categories?.teams?.name} · {sop.categories?.name ?? 'Uncategorised'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                    {total > 0 ? (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" />{stats.passed} passed
                        </span>
                        <span className="flex items-center gap-1 text-red-500">
                          <AlertCircle className="w-3 h-3" />{stats.failed} failed
                        </span>
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="w-3 h-3" />{stats.pending} pending
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No enrollments yet</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {(sops ?? []).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No live SOPs found</p>
          <p className="text-sm mt-1">Publish some SOPs first, then generate quizzes here.</p>
        </div>
      )}
    </div>
  )
}

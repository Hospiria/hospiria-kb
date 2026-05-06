export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { redirect, notFound } from 'next/navigation'
import { QuizTaker } from '@/components/quizzes/QuizTaker'
import { TiptapContent } from '@/types'

export default async function TakeQuizPage({ params }: { params: { id: string } }) {
  const session = await getEffectiveSession()
  if (!session) redirect('/login')
  const { effectiveUserId } = session
  const supabase = createClient()

  const { data: enrollment } = await supabase
    .from('quiz_enrollments')
    .select(`
      *,
      quizzes(
        id, title, questions, pass_mark,
        sops(id, title, content)
      )
    `)
    .eq('id', params.id)
    .eq('user_id', effectiveUserId)
    .single()

  if (!enrollment) notFound()

  const quiz = enrollment.quizzes as {
    id: string
    title: string
    questions: unknown[]
    pass_mark: number
    sops: { id: string; title: string; content: TiptapContent | null }
  }

  return (
    <QuizTaker
      enrollmentId={enrollment.id}
      enrollmentStatus={enrollment.status}
      existingScore={enrollment.score}
      quiz={quiz}
      sopContent={quiz.sops?.content ?? null}
      sopTitle={quiz.sops?.title ?? quiz.title}
      sopId={quiz.sops?.id ?? ''}
    />
  )
}

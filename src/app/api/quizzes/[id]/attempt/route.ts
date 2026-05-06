import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { QuizQuestion } from '@/types'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const enrollmentId = params.id
  const { answers } = await request.json() // { q1: 2, q2: 0, ... }

  // Load enrollment (verifies ownership via RLS)
  const { data: enrollment } = await supabase
    .from('quiz_enrollments')
    .select('*, quizzes(id, questions, pass_mark, title)')
    .eq('id', enrollmentId)
    .eq('user_id', user.id)
    .single()

  if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  if (enrollment.status !== 'pending') return NextResponse.json({ error: 'Quiz already completed' }, { status: 400 })

  const quiz = enrollment.quizzes as { id: string; questions: QuizQuestion[]; pass_mark: number; title: string }
  const questions: QuizQuestion[] = quiz.questions

  // Grade
  const correctCount = questions.filter(q => answers[q.id] === q.correct).length
  const score = Math.round((correctCount / questions.length) * 100)
  const passed = score >= quiz.pass_mark

  // Save attempt
  await supabase.from('quiz_attempts').insert({
    enrollment_id: enrollmentId,
    answers,
    score,
    passed,
  })

  // Update enrollment
  await supabase
    .from('quiz_enrollments')
    .update({ status: passed ? 'passed' : 'failed', score, completed_at: new Date().toISOString() })
    .eq('id', enrollmentId)

  return NextResponse.json({ score, passed, correctCount, totalQuestions: questions.length, passMark: quiz.pass_mark })
}

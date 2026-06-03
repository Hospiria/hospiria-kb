import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const authz = await requireFeature('quizzes', 'edit')
  if ('error' in authz) return authz.error
  const supabase = createClient()
  const adminClient = createAdminClient()

  const quizId = params.id
  const { userId, dueDays = 7 } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const { data: quiz } = await adminClient.from('quizzes').select('id, title').eq('id', quizId).single()
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + dueDays)

  // Create fresh enrollment (previous one stays for history)
  const { data: enrollment, error } = await adminClient
    .from('quiz_enrollments')
    .insert({ quiz_id: quizId, user_id: userId, enrolled_by: authz.userId, due_date: dueDate.toISOString(), status: 'pending' })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify user
  await adminClient.from('notifications').insert({
    user_id: userId,
    type: 'quiz_reenrolled',
    message: `You've been re-enrolled in "${quiz.title}". Please re-read the SOP and complete the quiz. Due in ${dueDays} days.`,
    link: `/quizzes/${enrollment.id}`,
  })

  return NextResponse.json({ enrollmentId: enrollment.id })
}

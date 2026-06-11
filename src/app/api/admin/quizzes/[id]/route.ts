import { createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('quizzes', 'edit')
  if ('error' in auth) return auth.error

  const db = createServiceClient()
  const quizId = params.id

  // Verify quiz exists before deleting
  const { data: quiz } = await db.from('quizzes').select('id, title').eq('id', quizId).single()
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  // Delete enrollments first (may not have FK cascade configured)
  await db.from('quiz_enrollments').delete().eq('quiz_id', quizId)

  // Delete the quiz
  const { error } = await db.from('quizzes').delete().eq('id', quizId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

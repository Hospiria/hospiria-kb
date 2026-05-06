import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const quizId = params.id
  const { userIds, dueDays = 7 } = await request.json()
  if (!userIds?.length) return NextResponse.json({ error: 'No users selected' }, { status: 400 })

  // Verify quiz exists and get SOP title for notification
  const { data: quiz } = await adminClient.from('quizzes').select('id, title, sop_id').eq('id', quizId).single()
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + dueDays)

  const enrollments = userIds.map((userId: string) => ({
    quiz_id: quizId,
    user_id: userId,
    enrolled_by: user.id,
    due_date: dueDate.toISOString(),
    status: 'pending',
  }))

  const { data, error } = await adminClient.from('quiz_enrollments').insert(enrollments).select('id, user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send notifications to enrolled users
  const notifications = (data ?? []).map((e: { user_id: string }) => ({
    user_id: e.user_id,
    type: 'quiz_enrolled',
    message: `You've been enrolled in a quiz: "${quiz.title}". Due in ${dueDays} days.`,
    link: `/quizzes/${(data ?? []).find((d: { user_id: string; id: string }) => d.user_id === e.user_id)?.id}`,
  }))
  if (notifications.length) await adminClient.from('notifications').insert(notifications)

  return NextResponse.json({ enrolled: data?.length ?? 0 })
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: enrollments, error } = await adminClient
    .from('quiz_enrollments')
    .select('*, profiles(id, full_name, role)')
    .eq('quiz_id', params.id)
    .order('enrolled_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enrollments })
}

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST { userId, quizTitle } — send an in-app reminder to a team member
// to complete an overdue quiz. Used by the Chase Up dashboard card.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, quizTitle } = await request.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const db = createServiceClient()
  const { data: sender } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  const senderName = (sender as { full_name?: string | null } | null)?.full_name ?? 'Your team leader'

  await db.from('notifications').insert({
    user_id: userId,
    type: 'quiz_reminder',
    message: `${senderName} is reminding you to complete ${quizTitle ? `"${quizTitle}"` : 'your overdue quiz'}.`,
    link: '/quizzes',
  })

  return NextResponse.json({ success: true })
}

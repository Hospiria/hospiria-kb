import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendQuizAssignedEmail } from '@/lib/notifications/email'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, name } = await request.json()
  if (!to) return NextResponse.json({ error: 'Missing to' }, { status: 400 })

  try {
    await sendQuizAssignedEmail({
      to,
      name: name ?? 'there',
      sopTitle: 'Test SOP — Email Setup Check',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    return NextResponse.json({ success: true, message: `Email sent to ${to}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

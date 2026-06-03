import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { userId, password } = await request.json()
    if (!userId || !password) return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

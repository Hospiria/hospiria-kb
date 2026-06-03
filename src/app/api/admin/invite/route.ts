import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, role, teamId, fullName, password } = await request.json()

    if (!email || !role || !password) {
      return NextResponse.json({ success: false, error: 'Email, role and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        full_name: fullName || email.split('@')[0],
      },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return NextResponse.json({ success: false, error: 'A user with this email already exists.' }, { status: 400 })
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role,
        primary_team_id: teamId || null,
        full_name: fullName || email.split('@')[0],
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

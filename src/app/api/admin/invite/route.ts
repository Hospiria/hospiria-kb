import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, role, teamId } = await request.json()

    if (!email || !role) {
      return NextResponse.json({ success: false, error: 'Email and role are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        role,
        full_name: email.split('@')[0],
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/callback`,
    })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    // Update profile with role and team after creation
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role,
        primary_team_id: teamId || null,
        full_name: email.split('@')[0],
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

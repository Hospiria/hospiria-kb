import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, role, teamId, fullName } = await request.json()

    if (!email || !role) {
      return NextResponse.json({ success: false, error: 'Email and role are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Create user without sending any email (avoids Supabase rate limits entirely)
    // email_confirm: true means the account is immediately active
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        role,
        full_name: fullName || email.split('@')[0],
      },
    })

    if (error) {
      // If user already exists, return a helpful message
      if (error.message.toLowerCase().includes('already')) {
        return NextResponse.json({ success: false, error: 'A user with this email already exists.' }, { status: 400 })
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    // Update profile with role and team
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role,
        primary_team_id: teamId || null,
        full_name: fullName || email.split('@')[0],
      })
    }

    // Generate a password-reset link so the admin can share it with the new user
    // This lets them set their own password without needing an email invite
    let setupLink: string | null = null
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${appUrl}/auth/callback?type=recovery`,
        },
      })
      if (!linkError && linkData?.properties?.action_link) {
        setupLink = linkData.properties.action_link
      }
    } catch {
      // Link generation is best-effort; user creation still succeeded
    }

    return NextResponse.json({ success: true, setupLink })
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

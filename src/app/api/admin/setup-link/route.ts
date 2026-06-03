import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 })

    const supabase = createAdminClient()

    // Look up the user's email from auth
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo: `${appUrl}/auth/callback?type=recovery` },
    })

    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ success: false, error: error?.message ?? 'Could not generate link' }, { status: 400 })
    }

    return NextResponse.json({ success: true, link: data.properties.action_link })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

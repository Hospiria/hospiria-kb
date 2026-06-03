import { createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const auth = await requireFeature('users', 'edit')
    if ('error' in auth) return auth.error

    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 })

    const supabase = createAdminClient()

    // Delete profile first, then auth user
    await supabase.from('profiles').delete().eq('id', userId)
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

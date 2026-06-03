import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Role } from '@/types'
import { FEATURE_KEYS, FeatureKey } from '@/lib/permissions'
import { getRolePermissions, getUserOverrides } from '@/lib/permissions-server'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

// GET ?userId= — returns the user's role, the role-effective grid (what they
// inherit), and their sparse per-feature overrides.
export async function GET(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const userId = new URL(request.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const db = createServiceClient()
  const { data: profile } = await db.from('profiles').select('id, full_name, role').eq('id', userId).single()
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const role = profile.role as Role
  const [rolePermissions, overrides] = await Promise.all([
    getRolePermissions(db, role),
    getUserOverrides(db, userId),
  ])
  return NextResponse.json({
    userId,
    fullName: profile.full_name,
    role,
    rolePermissions,
    overrides,
  })
}

// PUT { userId, items: [{ feature, can_view, can_edit }] } — replace this
// user's override rows wholesale. Features NOT in items inherit from the role.
// Edit implies view.
export async function PUT(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const userId = body.userId as string
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const db = createServiceClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).single()
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (profile.role === 'super_admin') {
    return NextResponse.json({ error: 'Super Admin permissions cannot be restricted.' }, { status: 400 })
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((it: { feature?: string }) => FEATURE_KEYS.includes(it?.feature as FeatureKey))
    .map((it: { feature: string; can_view?: boolean; can_edit?: boolean }) => {
      const can_edit = !!it.can_edit
      return { user_id: userId, feature: it.feature, can_view: can_edit || !!it.can_view, can_edit, updated_by: auth.userId, updated_at: new Date().toISOString() }
    })

  const { error: delErr } = await db.from('user_permissions').delete().eq('user_id', userId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  if (items.length > 0) {
    const { error: insErr } = await db.from('user_permissions').insert(items)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, userId, count: items.length })
}

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Role } from '@/types'
import { ROLES, FEATURE_KEYS, FeatureKey } from '@/lib/permissions'
import { getRolePermissions } from '@/lib/permissions-server'

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

// GET ?role=team_leader — role-effective grid (defaults + saved overrides).
export async function GET(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const role = new URL(request.url).searchParams.get('role') as Role | null
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  const db = createServiceClient()
  const permissions = await getRolePermissions(db, role)
  return NextResponse.json({ role, permissions })
}

// PUT { role, items: [{ feature, can_view, can_edit }] } — replace this role's
// override rows wholesale. Edit implies view; unknown features are ignored.
export async function PUT(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const role = body.role as Role
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  if (role === 'super_admin') {
    return NextResponse.json({ error: 'Super Admin permissions cannot be restricted.' }, { status: 400 })
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((it: { feature?: string }) => FEATURE_KEYS.includes(it?.feature as FeatureKey))
    .map((it: { feature: string; can_view?: boolean; can_edit?: boolean }) => {
      const can_edit = !!it.can_edit
      return { role, feature: it.feature, can_view: can_edit || !!it.can_view, can_edit, updated_by: auth.userId, updated_at: new Date().toISOString() }
    })

  const db = createServiceClient()
  const { error: delErr } = await db.from('role_permissions').delete().eq('role', role)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  if (items.length > 0) {
    const { error: insErr } = await db.from('role_permissions').insert(items)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, role, count: items.length })
}

// Server-side enforcement helpers for the permission system (Phase 2).
//
// Two entry points:
//   requireFeature(feature, level)  — for API route handlers. Returns either
//                                     { userId, role, perms } or { error: Response }.
//   requirePage(feature, level)     — for server pages. Redirects if not allowed.
//
// API routes enforce on the REAL signed-in user. Pages + the sidebar enforce on
// the EFFECTIVE (impersonated) user, so "view as" reflects that user's access.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { Role } from '@/types'
import { FeatureKey, Perm } from './permissions'
import { getEffectivePermissions } from './permissions-server'
import { getEffectiveSession } from './impersonation'

function allowed(perms: Record<FeatureKey, Perm>, feature: FeatureKey, level: 'view' | 'edit'): boolean {
  const p = perms[feature]
  if (!p) return false
  return level === 'edit' ? p.edit : p.view || p.edit
}

/** Permissions for the REAL signed-in user (used by API routes). */
async function getRealUserPerms(): Promise<{ userId: string; role: Role; perms: Record<FeatureKey, Perm> } | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return null
  const db = createServiceClient()
  const perms = await getEffectivePermissions(db, user.id, profile.role as Role)
  return { userId: user.id, role: profile.role as Role, perms }
}

/**
 * Guard an API route. Usage:
 *   const auth = await requireFeature('companies', 'edit')
 *   if ('error' in auth) return auth.error
 *   // use auth.userId / auth.role / auth.perms
 */
export async function requireFeature(feature: FeatureKey, level: 'view' | 'edit') {
  const me = await getRealUserPerms()
  if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!allowed(me.perms, feature, level)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: me.userId, role: me.role, perms: me.perms }
}

/** Permissions for the EFFECTIVE (impersonated-or-real) user — used by pages + layout. */
export async function getSessionPermissions(): Promise<{ userId: string; role: Role; perms: Record<FeatureKey, Perm> } | null> {
  const session = await getEffectiveSession()
  if (!session || !session.profile) return null
  const role = session.profile.role as Role
  const db = createServiceClient()
  const perms = await getEffectivePermissions(db, session.effectiveUserId, role)
  return { userId: session.effectiveUserId, role, perms }
}

/** Guard a server page. Redirects to /login (unauthenticated) or /dashboard (no access). */
export async function requirePage(feature: FeatureKey, level: 'view' | 'edit' = 'view') {
  const me = await getSessionPermissions()
  if (!me) redirect('/login')
  if (!allowed(me.perms, feature, level)) redirect('/dashboard')
  return me
}

// Server-side permission resolution. Reads the override tables and folds them
// over the code defaults. Used by the admin permissions UI now, and by route
// guards / RLS helpers in later phases.

import type { SupabaseClient } from '@supabase/supabase-js'
import { Role } from '@/types'
import { FeatureKey, Perm, FEATURE_KEYS, defaultPerm, normalisePerm } from './permissions'

interface PermRow { feature: string; can_view: boolean; can_edit: boolean }

/** Role-effective permissions = code defaults with role_permissions overrides applied. */
export async function getRolePermissions(db: SupabaseClient, role: Role): Promise<Record<FeatureKey, Perm>> {
  const { data } = await db
    .from('role_permissions')
    .select('feature, can_view, can_edit')
    .eq('role', role)
  const overrides = new Map<string, Perm>(
    ((data ?? []) as PermRow[]).map(r => [r.feature, { view: r.can_view, edit: r.can_edit }])
  )
  const out = {} as Record<FeatureKey, Perm>
  for (const key of FEATURE_KEYS) {
    out[key] = normalisePerm(overrides.get(key) ?? defaultPerm(role, key))
  }
  return out
}

/** Sparse per-user overrides (only features the admin has explicitly set). */
export async function getUserOverrides(db: SupabaseClient, userId: string): Promise<Partial<Record<FeatureKey, Perm>>> {
  const { data } = await db
    .from('user_permissions')
    .select('feature, can_view, can_edit')
    .eq('user_id', userId)
  const out: Partial<Record<FeatureKey, Perm>> = {}
  for (const r of (data ?? []) as PermRow[]) {
    out[r.feature as FeatureKey] = { view: r.can_view, edit: r.can_edit }
  }
  return out
}

/** Final effective permissions for a user = user override ?? role-effective. */
export async function getEffectivePermissions(db: SupabaseClient, userId: string, role: Role): Promise<Record<FeatureKey, Perm>> {
  const [rolePerms, userOverrides] = await Promise.all([
    getRolePermissions(db, role),
    getUserOverrides(db, userId),
  ])
  const out = {} as Record<FeatureKey, Perm>
  for (const key of FEATURE_KEYS) {
    out[key] = normalisePerm(userOverrides[key] ?? rolePerms[key])
  }
  return out
}

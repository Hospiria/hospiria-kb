'use client'

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { Loader2, Save, Lock, Info } from 'lucide-react'
import {
  FEATURES, FeatureKey, Perm, ROLES, ROLE_LABEL, FEATURE_BY_KEY,
} from '@/lib/permissions'
import { Role } from '@/types'

type GroupName = 'Core' | 'SOPs' | 'Learning' | 'Admin'
const GROUP_ORDER: GroupName[] = ['Core', 'SOPs', 'Learning', 'Admin']
type OverrideState = 'inherit' | 'none' | 'view' | 'edit'

// ---------------------------------------------------------------------------
// ROLE DEFAULTS editor
// ---------------------------------------------------------------------------
export function RolesEditor() {
  const [role, setRole] = useState<Role>('team_leader')
  const [grid, setGrid] = useState<Record<FeatureKey, Perm> | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async (r: Role) => {
    setLoading(true); setMessage(''); setGrid(null)
    try {
      const res = await fetch(`/api/admin/permissions/role?role=${r}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setGrid(data.permissions)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load('team_leader') }, [load])

  function onRole(r: Role) {
    setRole(r)
    if (r !== 'super_admin') load(r)
    else setGrid(null)
  }

  function setPerm(feature: FeatureKey, next: Perm) {
    setGrid(prev => prev ? { ...prev, [feature]: next } : prev)
  }

  async function save() {
    if (!grid) return
    setSaving(true); setMessage('')
    try {
      const items = FEATURES.map(f => ({ feature: f.key, can_view: grid[f.key].view, can_edit: grid[f.key].edit }))
      const res = await fetch('/api/admin/permissions/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setMessage('Saved.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Set the default permissions for a role. Everyone with that role inherits these unless overridden on an individual user.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Role</label>
        <select
          value={role}
          onChange={e => onRole(e.target.value as Role)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        {role !== 'super_admin' && grid && (
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save {ROLE_LABEL[role]}
          </button>
        )}
        {message && <span className="text-sm text-teal-600 font-medium">{message}</span>}
      </div>

      {role === 'super_admin' ? (
        <LockedNote />
      ) : loading || !grid ? (
        <Loading />
      ) : (
        <PermGrid renderRow={(f) => (
          <RoleRow key={f.key} feature={f.key} perm={grid[f.key]} onChange={p => setPerm(f.key, p)} />
        )} />
      )}
    </div>
  )
}

function RoleRow({ feature, perm, onChange }: { feature: FeatureKey; perm: Perm; onChange: (p: Perm) => void }) {
  const f = FEATURE_BY_KEY[feature]
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 border-b border-gray-50 last:border-b-0">
      <FeatureLabel featureKey={feature} />
      <Check
        label="View"
        disabled={!f.hasView || perm.edit}
        checked={f.hasView ? perm.view || perm.edit : false}
        onChange={v => onChange({ view: v, edit: perm.edit && v })}
      />
      <Check
        label="Edit"
        disabled={!f.hasEdit}
        checked={f.hasEdit ? perm.edit : false}
        onChange={v => onChange({ view: v ? true : perm.view, edit: v })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PER-USER overrides editor (embedded under a user row)
// ---------------------------------------------------------------------------
export interface UserPermsHandle { save: () => Promise<boolean> }

export const UserPermissionsEditor = forwardRef<UserPermsHandle, { userId: string; role: Role; hideSaveBar?: boolean }>(
function UserPermissionsEditor({ userId, role, hideSaveBar }, ref) {
  const [rolePerms, setRolePerms] = useState<Record<FeatureKey, Perm> | null>(null)
  const [overrides, setOverrides] = useState<Partial<Record<FeatureKey, OverrideState>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const isSuperAdmin = role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true); setMessage(''); setRolePerms(null); setOverrides({})
    try {
      const res = await fetch(`/api/admin/permissions/user?userId=${userId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRolePerms(data.rolePermissions)
      const ov: Partial<Record<FeatureKey, OverrideState>> = {}
      for (const [key, p] of Object.entries(data.overrides as Record<string, Perm>)) {
        ov[key as FeatureKey] = p.edit ? 'edit' : p.view ? 'view' : 'none'
      }
      setOverrides(ov)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { if (!isSuperAdmin) load() }, [load, isSuperAdmin])

  const save = useCallback(async (): Promise<boolean> => {
    if (role === 'super_admin') return true
    setSaving(true); setMessage('')
    try {
      const items = (Object.entries(overrides) as [FeatureKey, OverrideState][])
        .filter(([, state]) => state !== 'inherit')
        .map(([feature, state]) => ({
          feature,
          can_view: state === 'view' || state === 'edit',
          can_edit: state === 'edit',
        }))
      const res = await fetch('/api/admin/permissions/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setMessage('Saved.')
      return true
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [overrides, userId, role])

  useImperativeHandle(ref, () => ({ save }), [save])

  if (isSuperAdmin) return <LockedNote />
  if (loading || !rolePerms) return <Loading />

  const overrideCount = Object.values(overrides).filter(s => s && s !== 'inherit').length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-500">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
        <span>Each feature inherits from the <strong className="text-gray-700">{ROLE_LABEL[role]}</strong> role unless overridden.</span>
      </div>
      <PermGrid renderRow={(f) => (
        <PersonRow
          key={f.key}
          feature={f.key}
          inherited={rolePerms[f.key]}
          state={overrides[f.key] ?? 'inherit'}
          onChange={state => setOverrides(prev => ({ ...prev, [f.key]: state }))}
        />
      )} />
      {hideSaveBar ? (
        <span className="text-xs text-gray-400">{overrideCount} override{overrideCount === 1 ? '' : 's'}</span>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save permissions
          </button>
          <span className="text-xs text-gray-400">{overrideCount} override{overrideCount === 1 ? '' : 's'}</span>
          {message && <span className="text-sm text-teal-600 font-medium">{message}</span>}
        </div>
      )}
    </div>
  )
})

function PersonRow({ feature, inherited, state, onChange }: {
  feature: FeatureKey
  inherited: Perm
  state: OverrideState
  onChange: (s: OverrideState) => void
}) {
  const f = FEATURE_BY_KEY[feature]
  const inheritedLabel = inherited.edit ? 'Edit' : inherited.view ? 'View only' : 'No access'
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2.5 border-b border-gray-50 last:border-b-0">
      <FeatureLabel featureKey={feature} />
      <select
        value={state}
        onChange={e => onChange(e.target.value as OverrideState)}
        className={`text-sm border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
          state === 'inherit' ? 'border-gray-200 text-gray-500' : 'border-teal-300 text-teal-800 bg-teal-50'
        }`}
      >
        <option value="inherit">Inherit ({inheritedLabel})</option>
        <option value="none">No access</option>
        {f.hasView && <option value="view">View only</option>}
        {f.hasEdit && <option value="edit">Edit</option>}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function PermGrid({ renderRow }: { renderRow: (f: typeof FEATURES[number]) => ReactNode }) {
  return (
    <div className="space-y-4">
      {GROUP_ORDER.map(group => {
        const rows = FEATURES.filter(f => f.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group}</p>
            </div>
            <div>{rows.map(renderRow)}</div>
          </div>
        )
      })}
    </div>
  )
}

function FeatureLabel({ featureKey }: { featureKey: FeatureKey }) {
  const f = FEATURE_BY_KEY[featureKey]
  const hint = [f.viewHint && `view: ${f.viewHint}`, f.editHint && `edit: ${f.editHint}`].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-800">{f.label}</p>
      {hint && <p className="text-xs text-gray-400 truncate">{hint}</p>}
    </div>
  )
}

function Check({ label, checked, disabled, onChange }: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className={`flex items-center gap-1.5 text-sm select-none ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
      />
      <span className="w-9 text-gray-600">{label}</span>
    </label>
  )
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  )
}

function LockedNote() {
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
      <Lock className="w-4 h-4 flex-shrink-0" /> Super Admin always has full access and can&apos;t be restricted.
    </div>
  )
}

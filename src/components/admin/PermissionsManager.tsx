'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Loader2, Save, ShieldCheck, Users, Lock, Info } from 'lucide-react'
import {
  FEATURES, FeatureKey, Perm, ROLES, ROLE_LABEL, FEATURE_BY_KEY,
} from '@/lib/permissions'
import { Role } from '@/types'

type Mode = 'roles' | 'people'
type GroupName = 'Core' | 'SOPs' | 'Learning' | 'Admin'
const GROUP_ORDER: GroupName[] = ['Core', 'SOPs', 'Learning', 'Admin']

interface UserLite { id: string; full_name: string | null; role: string }
type OverrideState = 'inherit' | 'none' | 'view' | 'edit'

export function PermissionsManager({ users }: { users: UserLite[] }) {
  const [mode, setMode] = useState<Mode>('roles')

  return (
    <div className="space-y-5">
      {/* Mode switch */}
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <button
          onClick={() => setMode('roles')}
          className={tab(mode === 'roles')}
        >
          <ShieldCheck className="w-4 h-4" /> Roles
        </button>
        <button
          onClick={() => setMode('people')}
          className={tab(mode === 'people')}
        >
          <Users className="w-4 h-4" /> People
        </button>
      </div>

      {mode === 'roles' ? <RolesEditor /> : <PeopleEditor users={users} />}
    </div>
  )
}

function tab(active: boolean) {
  return `flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    active ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'
  }`
}

// ---------------------------------------------------------------------------
// ROLES
// ---------------------------------------------------------------------------
function RolesEditor() {
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

  // Load the initial role on mount.
  useEffect(() => { load('team_leader') }, [load])

  // Load on role change.
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
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <Lock className="w-4 h-4 flex-shrink-0" /> Super Admin always has full access and can&apos;t be restricted.
        </div>
      ) : loading || !grid ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <PermGrid
          renderRow={(f) => (
            <RoleRow key={f.key} feature={f.key} perm={grid[f.key]} onChange={p => setPerm(f.key, p)} />
          )}
        />
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
// PEOPLE
// ---------------------------------------------------------------------------
function PeopleEditor({ users }: { users: UserLite[] }) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [rolePerms, setRolePerms] = useState<Record<FeatureKey, Perm> | null>(null)
  const [overrides, setOverrides] = useState<Partial<Record<FeatureKey, OverrideState>>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const selectable = users.filter(u => u.role !== 'super_admin')

  async function onUser(id: string) {
    setUserId(id); setMessage(''); setRolePerms(null); setOverrides({}); setRole(null)
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/permissions/user?userId=${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRole(data.role)
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
  }

  async function save() {
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Person</label>
        <select
          value={userId}
          onChange={e => onUser(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[16rem]"
        >
          <option value="">Select a person…</option>
          {selectable.map(u => (
            <option key={u.id} value={u.id}>{u.full_name ?? '(no name)'} — {ROLE_LABEL[u.role as Role] ?? u.role}</option>
          ))}
        </select>
        {userId && rolePerms && (
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save overrides
          </button>
        )}
        {message && <span className="text-sm text-teal-600 font-medium">{message}</span>}
      </div>

      {!userId ? (
        <p className="text-sm text-gray-400 py-8 text-center">Select a person to set their permissions.</p>
      ) : loading || !rolePerms ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-500">
            <Info className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span>Each feature inherits from the <strong className="text-gray-700">{role ? ROLE_LABEL[role] : ''}</strong> role unless you override it below.</span>
          </div>
          <PermGrid
            renderRow={(f) => (
              <PersonRow
                key={f.key}
                feature={f.key}
                inherited={rolePerms[f.key]}
                state={overrides[f.key] ?? 'inherit'}
                onChange={state => setOverrides(prev => ({ ...prev, [f.key]: state }))}
              />
            )}
          />
        </>
      )}
    </div>
  )
}

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

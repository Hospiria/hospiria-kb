'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Save, Shield, ShieldCheck } from 'lucide-react'
import { Profile, Team, Role } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import { UserPermissionsEditor } from './PermissionsManager'

interface Props {
  user: Pick<Profile, 'id' | 'full_name' | 'role' | 'primary_team_id'>
  teams: Team[]
  teamAccessTeamIds: string[]
}

export function UserEditor({ user, teams, teamAccessTeamIds }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState(user.full_name ?? '')
  const [role, setRole] = useState<string>(user.role)
  const [teamId, setTeamId] = useState(user.primary_team_id ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [access, setAccess] = useState<Set<string>>(new Set(teamAccessTeamIds))

  async function saveProfile() {
    setSaving(true); setMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name || null, role, primary_team_id: teamId || null })
      .eq('id', user.id)
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setMsg('Saved.')
    router.refresh()
  }

  async function toggleAccess(tid: string) {
    if (teamId === tid) return // primary team, can't toggle
    if (access.has(tid)) {
      await supabase.from('team_access').delete().eq('user_id', user.id).eq('team_id', tid)
      setAccess(prev => { const n = new Set(prev); n.delete(tid); return n })
    } else {
      const { data: { user: me } } = await supabase.auth.getUser()
      await supabase.from('team_access').upsert({ user_id: user.id, team_id: tid, granted_by: me?.id })
      setAccess(prev => new Set(prev).add(tid))
    }
    router.refresh()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Users
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-semibold">{(user.full_name ?? 'U')[0].toUpperCase()}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-700">{user.full_name ?? '—'}</h1>
          <div className="mt-0.5"><RoleBadge role={user.role} /></div>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-navy-700">Profile</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500 mb-1">Full name</span>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500 mb-1">Role</span>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="agent">Agent</option>
              <option value="junior_team_leader">Junior Team Leader</option>
              <option value="team_leader">Team Leader</option>
              <option value="approver">Approver</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500 mb-1">Primary team</span>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">No team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save profile'}
          </button>
          {msg && <span className="text-sm text-teal-600 font-medium">{msg}</span>}
          {role !== user.role && (
            <span className="text-xs text-amber-600">Save to apply the new role — the permissions below inherit from the saved role.</span>
          )}
        </div>
      </div>

      {/* Cross-team access */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="font-semibold text-navy-700 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Cross-team access</h2>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No teams configured.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {teams.map(team => {
              const isPrimary = teamId === team.id
              const hasAccess = isPrimary || access.has(team.id)
              return (
                <button
                  key={team.id}
                  disabled={isPrimary}
                  onClick={() => toggleAccess(team.id)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    hasAccess
                      ? isPrimary
                        ? 'bg-navy-100 text-navy-700 border-navy-200 cursor-default'
                        : 'bg-teal-100 text-teal-700 border-teal-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200'
                  }`}
                >
                  {team.name} {isPrimary ? '(primary)' : hasAccess ? '✓' : '+'}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Permissions */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="font-semibold text-navy-700 mb-1 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Permissions</h2>
        <p className="text-sm text-gray-500 mb-4">What this person can view and edit. Leave a feature on &ldquo;Inherit&rdquo; to follow their role.</p>
        <UserPermissionsEditor userId={user.id} role={user.role as Role} />
      </div>
    </div>
  )
}

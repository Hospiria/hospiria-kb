'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, Team } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { UserPlus, Edit2, Check, X, Shield, Eye, Copy, CheckCheck, Link2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

type UserWithTeams = Profile & {
  teams?: { name: string } | null
  team_access?: { team_id: string; teams?: { name: string } | null }[]
}

export function UserManagement({ users, teams }: { users: UserWithTeams[]; teams: Team[] }) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')
  const [inviteRole, setInviteRole] = useState('agent')
  const [inviteTeam, setInviteTeam] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [setupLink, setSetupLink] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editTeam, setEditTeam] = useState('')
  const [saving, setSaving] = useState(false)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null)
  const [userLinks, setUserLinks] = useState<Record<string, string>>({})
  const router = useRouter()
  const supabase = createClient()

  async function viewAs(userId: string) {
    setImpersonating(userId)
    await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteMsg('')
    setInviteSuccess(false)
    setSetupLink(null)
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, teamId: inviteTeam, fullName: inviteFullName }),
      })
      const json = await res.json()
      if (json.success) {
        setInviteSuccess(true)
        setSetupLink(json.setupLink ?? null)
        setInviteEmail('')
        setInviteFullName('')
        router.refresh()
      } else {
        setInviteMsg(json.error ?? 'Error creating user')
      }
    } finally {
      setInviting(false)
    }
  }

  async function generateSetupLink(userId: string, email: string) {
    setGeneratingLinkFor(userId)
    try {
      const res = await fetch('/api/admin/setup-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (json.success) {
        setUserLinks(prev => ({ ...prev, [userId]: json.link }))
      }
    } finally {
      setGeneratingLinkFor(null)
    }
  }

  async function startEdit(user: UserWithTeams) {
    setEditingId(user.id)
    setEditName(user.full_name ?? '')
    setEditRole(user.role)
    setEditTeam(user.primary_team_id ?? '')
  }

  async function saveEdit(userId: string) {
    setSaving(true)
    await supabase.from('profiles').update({ full_name: editName || null, role: editRole, primary_team_id: editTeam || null }).eq('id', userId)
    setEditingId(null)
    setSaving(false)
    router.refresh()
  }

  async function grantTeamAccess(userId: string, teamId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('team_access').upsert({ user_id: userId, team_id: teamId, granted_by: user?.id })
    router.refresh()
  }

  async function revokeTeamAccess(userId: string, teamId: string) {
    await supabase.from('team_access').delete().eq('user_id', userId).eq('team_id', teamId)
    router.refresh()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">User Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Invite and manage team members</p>
      </div>

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="font-semibold text-navy-700 mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Invite User
        </h2>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={inviteFullName}
              onChange={e => setInviteFullName(e.target.value)}
              placeholder="Full name"
              className="flex-1 min-w-[160px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              required
              placeholder="email@hospiria.com"
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="agent">Agent</option>
              <option value="junior_team_leader">Junior Team Leader</option>
              <option value="team_leader">Team Leader</option>
              <option value="approver">Approver</option>
              <option value="super_admin">Admin</option>
            </select>
            <select
              value={inviteTeam}
              onChange={e => setInviteTeam(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">No team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
            >
              {inviting ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
        {inviteMsg && <p className="text-sm text-red-500 mt-2">{inviteMsg}</p>}
        {inviteSuccess && (
          <div className="mt-3 p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
            <p className="text-sm font-semibold text-teal-800">✓ User created successfully!</p>
            {setupLink ? (
              <>
                <p className="text-xs text-teal-700">Share this password-setup link with them via Teams or WhatsApp:</p>
                <SetupLinkCopy link={setupLink} />
              </>
            ) : (
              <p className="text-xs text-teal-700">User created. They can use &quot;Forgot password&quot; on the login page to set their password.</p>
            )}
          </div>
        )}
      </div>

      {/* Users table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-navy-700">{users.length} Users</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {users.map(u => (
            <div key={u.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-semibold">
                        {(u.full_name ?? 'U')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-700">{u.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">Joined {formatDate(u.created_at)}</p>
                    </div>
                  </div>
                </div>

                {editingId === u.id ? (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Full name"
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 w-36"
                    />
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="agent">Agent</option>
                      <option value="author">Author</option>
                      <option value="approver">Approver</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    <select
                      value={editTeam}
                      onChange={e => setEditTeam(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">No team</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button onClick={() => saveEdit(u.id)} disabled={saving} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <RoleBadge role={u.role} />
                      {u.teams && <p className="text-xs text-gray-400 mt-0.5">{u.teams.name}</p>}
                    </div>
                    <button
                      onClick={() => viewAs(u.id)}
                      disabled={impersonating === u.id}
                      title="View app as this user"
                      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => generateSetupLink(u.id, u.id)}
                      disabled={generatingLinkFor === u.id}
                      title="Get login setup link"
                      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => startEdit(u)} className="p-1.5 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Setup link if generated */}
              {userLinks[u.id] && (
                <div className="mt-2 ml-10">
                  <SetupLinkCopy link={userLinks[u.id]} onClose={() => setUserLinks(prev => { const n = {...prev}; delete n[u.id]; return n })} />
                </div>
              )}

              {/* Cross-team access */}
              <div className="mt-3 ml-10">
                <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Cross-team access
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {teams.map(team => {
                    const hasAccess = u.team_access?.some(ta => ta.team_id === team.id) || u.primary_team_id === team.id
                    const isPrimary = u.primary_team_id === team.id
                    return (
                      <button
                        key={team.id}
                        disabled={isPrimary}
                        onClick={() => hasAccess && !isPrimary ? revokeTeamAccess(u.id, team.id) : grantTeamAccess(u.id, team.id)}
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SetupLinkCopy({ link, onClose }: { link: string; onClose?: () => void }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-teal-800">Share this login link with the user:</p>
        {onClose && <button onClick={onClose} className="text-teal-400 hover:text-teal-600"><X className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="flex items-start gap-2">
        <code className="flex-1 text-[11px] bg-white border border-teal-200 rounded-lg px-2 py-1.5 text-teal-900 break-all leading-snug">
          {link}
        </code>
        <button
          onClick={copy}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-teal-600">Link expires after first use. They click it, set a password, and they&apos;re in.</p>
    </div>
  )
}

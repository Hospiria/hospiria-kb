'use client'

import { useState } from 'react'
import { Profile, Team } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { UserPlus, Edit2, X, Eye, Copy, CheckCheck, Link2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RolesEditor } from './PermissionsManager'

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
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null)
  const [userLinks, setUserLinks] = useState<Record<string, string>>({})
  const [activeView, setActiveView] = useState<'users' | 'roles'>('users')
  const router = useRouter()

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

  async function generateSetupLink(userId: string) {
    setGeneratingLinkFor(userId)
    try {
      const res = await fetch('/api/admin/setup-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const json = await res.json()
      if (json.success) {
        setUserLinks(prev => ({ ...prev, [userId]: json.link }))
      }
    } finally {
      setGeneratingLinkFor(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Users &amp; Permissions</h1>
          <p className="text-gray-500 text-sm mt-0.5">Invite people, manage access, and set what each role can do</p>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          <button onClick={() => setActiveView('users')} className={subtab(activeView === 'users')}>Users</button>
          <button onClick={() => setActiveView('roles')} className={subtab(activeView === 'roles')}>Role defaults</button>
        </div>
      </div>

      {activeView === 'roles' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <RolesEditor />
        </div>
      )}

      {activeView === 'users' && (
        <>
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
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2 min-w-0 group">
                      <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-semibold">
                          {(u.full_name ?? 'U')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy-700 group-hover:text-teal-600 transition-colors truncate">{u.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">Joined {formatDate(u.created_at)}</p>
                      </div>
                    </Link>

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
                        onClick={() => generateSetupLink(u.id)}
                        disabled={generatingLinkFor === u.id}
                        title="Get login setup link"
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                      <Link
                        href={`/admin/users/${u.id}`}
                        title="Edit user & permissions"
                        className="p-1.5 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Setup link if generated */}
                  {userLinks[u.id] && (
                    <div className="mt-2 ml-10">
                      <SetupLinkCopy link={userLinks[u.id]} onClose={() => setUserLinks(prev => { const n = { ...prev }; delete n[u.id]; return n })} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function subtab(active: boolean) {
  return `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    active ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'
  }`
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

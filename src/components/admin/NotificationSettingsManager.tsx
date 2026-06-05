'use client'

import { useState } from 'react'
import {
  Bell, Mail, MessageSquare, Check, Loader2, ChevronDown,
  AlertTriangle, ExternalLink, Send, Eye, EyeOff, Webhook,
} from 'lucide-react'
import type { NotificationSetting, TeamWebhook } from '@/app/(app)/admin/notifications/page'

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agents' },
  { value: 'junior_team_leader', label: 'Junior Team Leaders' },
  { value: 'team_leader', label: 'Team Leaders' },
  { value: 'approver', label: 'Approvers' },
  { value: 'super_admin', label: 'Admins' },
  { value: 'author', label: 'SOP Author' },
]

const SCOPE_OPTIONS: { value: NotificationSetting['recipient_scope']; label: string }[] = [
  { value: 'team_only', label: 'Team members only' },
  { value: 'all_staff', label: 'All staff' },
  { value: 'specific_roles', label: 'Specific roles…' },
]

// ─── Default rows used when migration hasn't been run yet ─────────────────────
const FALLBACK_SETTINGS: NotificationSetting[] = [
  { event: 'quiz_assigned', label: 'Course assigned', description: 'Sent when a SOP is published and users are enrolled in the quiz.', email_enabled: true, teams_enabled: true, recipient_scope: 'team_only', recipient_roles: ['agent'], reminder_days_before: null, updated_at: '' },
  { event: 'quiz_reminder', label: 'Course due-date reminder', description: 'Reminder sent N days before a quiz is due to incomplete users.', email_enabled: true, teams_enabled: false, recipient_scope: 'team_only', recipient_roles: ['agent'], reminder_days_before: 3, updated_at: '' },
  { event: 'sop_published', label: 'SOP published', description: 'Sent when a SOP goes live. Notifies the team the document is available.', email_enabled: false, teams_enabled: true, recipient_scope: 'team_only', recipient_roles: ['agent'], reminder_days_before: null, updated_at: '' },
  { event: 'sop_submitted', label: 'SOP submitted for review', description: 'Sent when an author submits a SOP. Notifies approvers to take action.', email_enabled: false, teams_enabled: true, recipient_scope: 'specific_roles', recipient_roles: ['approver', 'team_leader'], reminder_days_before: null, updated_at: '' },
  { event: 'sop_approved', label: 'SOP approved', description: 'Sent to the author when their SOP is approved and goes live.', email_enabled: false, teams_enabled: false, recipient_scope: 'specific_roles', recipient_roles: ['author'], reminder_days_before: null, updated_at: '' },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationSettingsManager({
  settings: initial, teams: initialTeams, smtpConfigured, migrationNeeded,
}: {
  settings: NotificationSetting[]
  teams: TeamWebhook[]
  smtpConfigured: boolean
  migrationNeeded: boolean
}) {
  const displaySettings = initial.length > 0 ? initial : FALLBACK_SETTINGS
  const [settings, setSettings] = useState<NotificationSetting[]>(displaySettings)
  const [teams, setTeams] = useState<TeamWebhook[]>(initialTeams)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [activeSection, setActiveSection] = useState<'email' | 'teams' | 'events'>('events')

  async function patchSetting(event: string, fields: Partial<NotificationSetting>) {
    if (migrationNeeded) return // can't save until migration run
    setSaving(event)
    setSettings(prev => prev.map(s => s.event === event ? { ...s, ...fields } : s))
    const res = await fetch('/api/admin/notification-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...fields }),
    })
    setSaving(null)
    if (res.ok) { setSaved(event); setTimeout(() => setSaved(null), 2000) }
  }

  function toggleRole(s: NotificationSetting, role: string) {
    const roles = s.recipient_roles.includes(role)
      ? s.recipient_roles.filter(r => r !== role)
      : [...s.recipient_roles, role]
    patchSetting(s.event, { recipient_roles: roles })
  }

  async function patchWebhook(teamId: string, url: string) {
    setSaving(`webhook-${teamId}`)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, teams_webhook_url: url || null } : t))
    const res = await fetch(`/api/admin/teams/${teamId}/webhook`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: url }),
    })
    setSaving(null)
    if (res.ok) { setSaved(`webhook-${teamId}`); setTimeout(() => setSaved(null), 2000) }
  }

  async function sendTestEmail() {
    setTestingEmail(true); setTestResult(null)
    const res = await fetch('/api/internal/test-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '', name: 'Test' }), // server uses SMTP_USER as to
    }).catch(() => null)
    if (!res) { setTestResult({ ok: false, msg: 'Network error' }); setTestingEmail(false); return }
    const d = await res.json().catch(() => ({}))
    setTestResult({ ok: res.ok, msg: res.ok ? 'Test email sent! Check your inbox.' : d.error ?? 'Send failed.' })
    setTestingEmail(false)
  }

  const tabs = [
    { key: 'events' as const, label: 'Notification Events', icon: Bell },
    { key: 'teams' as const, label: 'Teams Webhooks', icon: Webhook },
    { key: 'email' as const, label: 'Email (SMTP)', icon: Mail },
  ]

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Bell className="w-6 h-6" /> Notification Settings
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure all notifications in one place — which events fire, who gets them, and where they&apos;re sent.
        </p>
      </div>

      {/* Migration warning */}
      {migrationNeeded && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Run migration 022 to enable saving.</strong> The preview below shows the default settings.
            Go to your{' '}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-medium">
              Supabase SQL editor <ExternalLink className="w-3 h-3 inline" />
            </a>{' '}
            and run <code className="bg-amber-100 px-1 rounded text-xs">supabase/migrations/022_notification_settings.sql</code>.
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${activeSection === tab.key ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.key === 'email' ? 'Email' : tab.key === 'teams' ? 'Teams' : 'Events'}</span>
          </button>
        ))}
      </div>

      {/* ── Events tab ─────────────────────────────────────────────────────── */}
      {activeSection === 'events' && (
        <div className="space-y-3">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_56px_64px_24px] gap-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            <span>Event</span>
            <span className="text-center flex items-center justify-center gap-1"><Mail className="w-3 h-3" /> Email</span>
            <span className="text-center flex items-center justify-center gap-1"><MessageSquare className="w-3 h-3" /> Teams</span>
            <span />
          </div>

          {settings.map(s => {
            const isBusy = saving === s.event
            const isSaved = saved === s.event
            const isOpen = expanded === s.event
            return (
              <div key={s.event} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-[1fr_56px_64px_24px] gap-3 items-center px-4 py-4">
                  <div>
                    <p className="font-semibold text-navy-700 text-sm">{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>
                  </div>
                  <div className="flex justify-center">
                    <Toggle value={s.email_enabled} onChange={v => patchSetting(s.event, { email_enabled: v })} disabled={isBusy || migrationNeeded} />
                  </div>
                  <div className="flex justify-center">
                    <Toggle value={s.teams_enabled} onChange={v => patchSetting(s.event, { teams_enabled: v })} disabled={isBusy || migrationNeeded} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isBusy && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                    {isSaved && <Check className="w-3.5 h-3.5 text-teal-500" />}
                    <button onClick={() => setExpanded(isOpen ? null : s.event)} className="text-gray-300 hover:text-navy-600">
                      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4 bg-slate-50/60 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Who receives this?</label>
                      <div className="flex flex-wrap gap-2">
                        {SCOPE_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => patchSetting(s.event, { recipient_scope: opt.value })}
                            disabled={isBusy || migrationNeeded}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${s.recipient_scope === opt.value ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {s.recipient_scope === 'specific_roles' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Which roles?</label>
                        <div className="flex flex-wrap gap-2">
                          {ROLE_OPTIONS.map(r => {
                            const active = s.recipient_roles.includes(r.value)
                            return (
                              <button key={r.value} onClick={() => toggleRole(s, r.value)}
                                disabled={isBusy || migrationNeeded}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 ${active ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                                {active && <Check className="w-3 h-3 text-teal-600" />}
                                {r.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {s.reminder_days_before !== null && (
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-gray-500">Send reminder</label>
                        <input type="number" min={1} max={30}
                          value={s.reminder_days_before ?? 3}
                          onChange={e => setSettings(prev => prev.map(x => x.event === s.event ? { ...x, reminder_days_before: Number(e.target.value) } : x))}
                          onBlur={e => patchSetting(s.event, { reminder_days_before: Number(e.target.value) })}
                          disabled={migrationNeeded}
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50" />
                        <label className="text-xs text-gray-500">days before due date</label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Teams Webhooks tab ──────────────────────────────────────────────── */}
      {activeSection === 'teams' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <strong>How Teams webhooks work:</strong> Create an Incoming Webhook in your Teams channel, paste the URL below. When a notification fires for that team, it posts a card to that channel automatically.
            <a href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook" target="_blank" rel="noopener noreferrer" className="ml-1 underline font-medium inline-flex items-center gap-0.5">
              Setup guide <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {teams.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-8">No teams found. Create teams in{' '}
              <a href="/admin/teams" className="text-teal-600 hover:underline">Teams &amp; Categories</a> first.</p>
          ) : (
            <div className="space-y-3">
              {teams.map(team => {
                const key = `webhook-${team.id}`
                const isBusy = saving === key
                const isSaved = saved === key
                return (
                  <div key={team.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-navy-700 text-sm">{team.name}</p>
                      <div className="flex items-center gap-2">
                        {team.teams_webhook_url
                          ? <span className="text-[11px] text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 font-medium flex items-center gap-1"><Check className="w-3 h-3" /> Configured</span>
                          : <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Not set</span>
                        }
                        {isBusy && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                        {isSaved && <Check className="w-4 h-4 text-teal-500" />}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        defaultValue={team.teams_webhook_url ?? ''}
                        onBlur={e => patchWebhook(team.id, e.target.value)}
                        placeholder="https://your-org.webhook.office.com/webhookb2/..."
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-xs"
                      />
                      {isBusy && <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />}
                      {team.teams_webhook_url && (
                        <TestWebhookButton teamId={team.id} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Email (SMTP) tab ────────────────────────────────────────────────── */}
      {activeSection === 'email' && (
        <div className="space-y-4">
          {/* Status card */}
          <div className={`rounded-2xl border p-5 ${smtpConfigured ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-start gap-3">
              <Mail className={`w-5 h-5 flex-shrink-0 mt-0.5 ${smtpConfigured ? 'text-green-600' : 'text-amber-600'}`} />
              <div>
                <p className={`font-semibold text-sm ${smtpConfigured ? 'text-green-800' : 'text-amber-800'}`}>
                  {smtpConfigured ? '✅ Gmail SMTP is configured' : '⚠️ Gmail SMTP not configured'}
                </p>
                <p className={`text-xs mt-0.5 ${smtpConfigured ? 'text-green-700' : 'text-amber-700'}`}>
                  {smtpConfigured
                    ? 'SMTP_USER and SMTP_PASS are set in your Vercel environment variables. Emails will send.'
                    : 'SMTP_USER and SMTP_PASS are not set. Emails are skipped even when enabled above.'}
                </p>
              </div>
            </div>
          </div>

          {/* Setup instructions */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-navy-700">Setup Gmail SMTP</h2>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-navy-100 text-navy-700 font-bold text-xs flex items-center justify-center flex-shrink-0">1</span>
                <span>Sign in to the Gmail account you want to send from.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-navy-100 text-navy-700 font-bold text-xs flex items-center justify-center flex-shrink-0">2</span>
                <span>Enable <strong>2-Step Verification</strong> under Google Account → Security.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-navy-100 text-navy-700 font-bold text-xs flex items-center justify-center flex-shrink-0">3</span>
                <span>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline font-medium inline-flex items-center gap-0.5">App passwords <ExternalLink className="w-3 h-3" /></a> → Create → copy the 16-character password.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-navy-100 text-navy-700 font-bold text-xs flex items-center justify-center flex-shrink-0">4</span>
                <div>
                  <span>Add these to your{' '}</span>
                  <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline font-medium inline-flex items-center gap-0.5">Vercel environment variables <ExternalLink className="w-3 h-3" /></a>:
                  <div className="mt-2 space-y-1">
                    <code className="block bg-gray-100 rounded-lg px-3 py-2 text-xs font-mono">SMTP_USER=you@gmail.com</code>
                    <code className="block bg-gray-100 rounded-lg px-3 py-2 text-xs font-mono">SMTP_PASS=abcdefghijklmnop</code>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-navy-100 text-navy-700 font-bold text-xs flex items-center justify-center flex-shrink-0">5</span>
                <span>Redeploy on Vercel after adding env vars, then use the test button below.</span>
              </li>
            </ol>
          </div>

          {/* Test button */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="font-semibold text-navy-700 mb-1 text-sm">Test email</h2>
            <p className="text-xs text-gray-400 mb-3">Sends a sample course-assigned email to <strong>{smtpConfigured ? 'SMTP_USER' : 'your configured address'}</strong>.</p>
            <div className="flex items-center gap-3">
              <button onClick={sendTestEmail} disabled={testingEmail || !smtpConfigured}
                className="flex items-center gap-2 px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {testingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send test email
              </button>
              {testResult && (
                <p className={`text-sm font-medium ${testResult.ok ? 'text-teal-600' : 'text-red-600'}`}>
                  {testResult.ok ? '✅' : '❌'} {testResult.msg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inline webhook test button ────────────────────────────────────────────────

function TestWebhookButton({ teamId }: { teamId: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  async function test() {
    setBusy(true); setResult(null)
    const res = await fetch('/api/admin/test-webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    }).catch(() => null)
    if (!res) { setResult({ ok: false, msg: 'Network error' }); setBusy(false); return }
    const d = await res.json().catch(() => ({}))
    setResult({ ok: res.ok, msg: res.ok ? '✅ Message sent!' : `❌ ${d.error ?? 'Failed'}` })
    setBusy(false)
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={test} disabled={busy}
        className="px-3 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Test
      </button>
      {result && <span className={`text-xs font-medium ${result.ok ? 'text-teal-600' : 'text-red-600'}`}>{result.msg}</span>}
    </div>
  )
}

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${value ? 'bg-teal-500' : 'bg-gray-200'} disabled:opacity-50`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

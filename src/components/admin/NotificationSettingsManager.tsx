'use client'

import { useState } from 'react'
import { Bell, Mail, MessageSquare, Check, Loader2, ChevronDown } from 'lucide-react'
import type { NotificationSetting } from '@/app/(app)/admin/notifications/page'

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agents' },
  { value: 'junior_team_leader', label: 'Junior Team Leaders' },
  { value: 'team_leader', label: 'Team Leaders' },
  { value: 'approver', label: 'Approvers' },
  { value: 'super_admin', label: 'Admins' },
  { value: 'author', label: 'SOP Author (the submitter)' },
]

const SCOPE_OPTIONS: { value: NotificationSetting['recipient_scope']; label: string }[] = [
  { value: 'team_only', label: 'Team members only' },
  { value: 'all_staff', label: 'All staff' },
  { value: 'specific_roles', label: 'Specific roles…' },
]

export function NotificationSettingsManager({ settings: initial }: { settings: NotificationSetting[] }) {
  const [settings, setSettings] = useState<NotificationSetting[]>(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function patch(event: string, fields: Partial<NotificationSetting>) {
    setSaving(event)
    setSettings(prev => prev.map(s => s.event === event ? { ...s, ...fields } : s))
    const res = await fetch('/api/admin/notification-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...fields }),
    })
    setSaving(null)
    if (res.ok) {
      setSaved(event)
      setTimeout(() => setSaved(null), 2000)
    }
  }

  function toggleRole(s: NotificationSetting, role: string) {
    const roles = s.recipient_roles.includes(role)
      ? s.recipient_roles.filter(r => r !== role)
      : [...s.recipient_roles, role]
    patch(s.event, { recipient_roles: roles })
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Bell className="w-6 h-6" /> Notification Settings
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Control which events send emails and Teams messages, and who receives them. Changes apply immediately.
        </p>
      </div>

      {/* SMTP status banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
        <Mail className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <strong>Email is sent via Gmail SMTP.</strong>{' '}
          Credentials are set as <code className="bg-blue-100 px-1 rounded text-xs">SMTP_USER</code> and{' '}
          <code className="bg-blue-100 px-1 rounded text-xs">SMTP_PASS</code> in the Vercel environment variables.
          If those are not set, emails are silently skipped even when enabled here.
        </div>
      </div>

      <div className="space-y-3">
        {settings.map(s => {
          const isBusy = saving === s.event
          const isSaved = saved === s.event
          const isOpen = expanded === s.event

          return (
            <div key={s.event} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Row header */}
              <div className="px-5 py-4 flex items-center gap-4">
                {/* Event name + description */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy-700 text-sm">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>
                </div>

                {/* Email toggle */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>
                  <Toggle
                    value={s.email_enabled}
                    onChange={v => patch(s.event, { email_enabled: v })}
                    disabled={isBusy}
                  />
                </div>

                {/* Teams toggle */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Teams</span>
                  <Toggle
                    value={s.teams_enabled}
                    onChange={v => patch(s.event, { teams_enabled: v })}
                    disabled={isBusy}
                  />
                </div>

                {/* Saved indicator */}
                <div className="w-6 flex-shrink-0">
                  {isBusy && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                  {isSaved && <Check className="w-4 h-4 text-teal-500" />}
                </div>

                {/* Expand / collapse */}
                <button
                  onClick={() => setExpanded(isOpen ? null : s.event)}
                  className="text-gray-400 hover:text-navy-600 transition-colors flex-shrink-0"
                  title="Configure recipients"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Expanded settings */}
              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4 bg-slate-50/60 space-y-4">

                  {/* Recipient scope */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Who receives this notification?</label>
                    <div className="flex flex-wrap gap-2">
                      {SCOPE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => patch(s.event, { recipient_scope: opt.value })}
                          disabled={isBusy}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${s.recipient_scope === opt.value ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Role checkboxes — only when specific_roles */}
                  {s.recipient_scope === 'specific_roles' && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Which roles?</label>
                      <div className="flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map(r => {
                          const active = s.recipient_roles.includes(r.value)
                          return (
                            <button
                              key={r.value}
                              onClick={() => toggleRole(s, r.value)}
                              disabled={isBusy}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${active ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                            >
                              {active && <Check className="w-3 h-3 text-teal-600" />}
                              {r.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Reminder days — only for reminder events */}
                  {s.reminder_days_before !== null && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-gray-500">Send reminder</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={s.reminder_days_before ?? 3}
                        onChange={e => setSettings(prev => prev.map(x => x.event === s.event ? { ...x, reminder_days_before: Number(e.target.value) } : x))}
                        onBlur={e => patch(s.event, { reminder_days_before: Number(e.target.value) })}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <label className="text-xs text-gray-500">days before the due date</label>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 italic">
                    Last updated: {new Date(s.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>Note:</strong> Teams notifications are sent to the webhook URL configured per team in{' '}
        <a href="/admin/teams" className="underline font-medium">Teams &amp; Categories</a>.
        If no webhook is set for a team, Teams notifications are skipped for that team regardless of these settings.
      </div>
    </div>
  )
}

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${value ? 'bg-teal-500' : 'bg-gray-200'} disabled:opacity-50`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

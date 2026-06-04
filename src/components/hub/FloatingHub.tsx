'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { MessageCircle, X, Sparkles, StickyNote, ListChecks, Lock, Globe } from 'lucide-react'
import { FeatureKey, Perm } from '@/lib/permissions'
import { ChatPanel } from './ChatPanel'
import { NotesPanel } from './NotesPanel'
import { TodosPanel } from './TodosPanel'

type Tab = 'chat' | 'notes' | 'todos'
type Space = 'personal' | string  // 'personal' or a team id
interface Team { id: string; name: string }

export function FloatingHub({ perms }: { perms: Record<FeatureKey, Perm> }) {
  const can = (f: FeatureKey) => { const p = perms[f]; return !!p && (p.view || p.edit) }
  const tabs: { key: Tab; label: string; icon: typeof MessageCircle }[] = [
    ...(can('chat')  ? [{ key: 'chat'  as Tab, label: 'Assistant', icon: Sparkles  }] : []),
    ...(can('notes') ? [{ key: 'notes' as Tab, label: 'Notes',     icon: StickyNote }] : []),
    ...(can('notes') ? [{ key: 'todos' as Tab, label: 'To-dos',    icon: ListChecks  }] : []),
  ]

  const [open, setOpen] = useState(false)
  const [tab, setTab]   = useState<Tab>(tabs[0]?.key ?? 'chat')
  const [space, setSpace] = useState<Space>('personal')
  const [teams, setTeams] = useState<Team[]>([])

  // Load teams once when hub opens
  useEffect(() => {
    if (!open) return
    fetch('/api/directory')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.teams) setTeams(d.teams) })
  }, [open])

  if (tabs.length === 0) return null

  const showSpaceSwitcher = tab === 'notes' || tab === 'todos'

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open hub"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-xl shadow-teal-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-navy-900 text-white flex-shrink-0">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold">Hospiria Hub</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab bar */}
            {tabs.length > 1 && (
              <div className="flex px-2 gap-1">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-t-lg transition-colors',
                      tab === t.key ? 'bg-white text-navy-700' : 'text-white/70 hover:text-white hover:bg-white/10'
                    )}>
                    <t.icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Space switcher (Notes + Todos only) */}
          {showSpaceSwitcher && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-gray-50 overflow-x-auto flex-shrink-0">
              <SpaceChip active={space === 'personal'} onClick={() => setSpace('personal')}>
                <Lock className="w-3 h-3" /> Personal
              </SpaceChip>
              {teams.map(t => (
                <SpaceChip key={t.id} active={space === t.id} onClick={() => setSpace(t.id)}>
                  <Globe className="w-3 h-3" /> {t.name}
                </SpaceChip>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {tab === 'chat'  && <ChatPanel onNavigate={() => setOpen(false)} />}
            {tab === 'notes' && <NotesPanel space={space} />}
            {tab === 'todos' && <TodosPanel space={space} teams={teams} />}
          </div>
        </div>
      )}
    </>
  )
}

function SpaceChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors flex-shrink-0',
        active
          ? 'bg-navy-700 text-white border-navy-700'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      )}>
      {children}
    </button>
  )
}

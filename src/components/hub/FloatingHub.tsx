'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MessageCircle, X, Sparkles, StickyNote, ListChecks } from 'lucide-react'
import { FeatureKey, Perm } from '@/lib/permissions'
import { ChatPanel } from './ChatPanel'
import { NotesPanel } from './NotesPanel'
import { TodosPanel } from './TodosPanel'

type Tab = 'chat' | 'notes' | 'todos'

export function FloatingHub({ perms }: { perms: Record<FeatureKey, Perm> }) {
  const can = (f: FeatureKey) => { const p = perms[f]; return !!p && (p.view || p.edit) }
  const tabs: { key: Tab; label: string; icon: typeof MessageCircle }[] = [
    ...(can('chat') ? [{ key: 'chat' as Tab, label: 'Assistant', icon: Sparkles }] : []),
    ...(can('notes') ? [{ key: 'notes' as Tab, label: 'Notes', icon: StickyNote }] : []),
    ...(can('notes') ? [{ key: 'todos' as Tab, label: 'To-dos', icon: ListChecks }] : []),
  ]

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'chat')

  if (tabs.length === 0) return null

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
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header + tabs */}
          <div className="bg-navy-900 text-white flex-shrink-0">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center"><Sparkles className="w-4 h-4" /></div>
                <p className="text-sm font-semibold">Hospiria Hub</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {tabs.length > 1 && (
              <div className="flex px-2 gap-1">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-t-lg transition-colors',
                      tab === t.key ? 'bg-white text-navy-700' : 'text-white/70 hover:text-white hover:bg-white/10'
                    )}
                  >
                    <t.icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0">
            {tab === 'chat' && <ChatPanel onNavigate={() => setOpen(false)} />}
            {tab === 'notes' && <NotesPanel />}
            {tab === 'todos' && <TodosPanel />}
          </div>
        </div>
      )}
    </>
  )
}

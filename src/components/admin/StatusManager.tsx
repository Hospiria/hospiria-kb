'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, GripVertical, Loader2 } from 'lucide-react'

interface TodoStatus { id: string; name: string; color: string; position: number; is_done: boolean; is_default: boolean }

const PRESET_COLORS = ['#94a3b8','#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#f97316','#06b6d4']

export function StatusManager({ initialStatuses }: { initialStatuses: TodoStatus[] }) {
  const [statuses, setStatuses] = useState<TodoStatus[]>(initialStatuses)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newIsDone, setNewIsDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function create() {
    if (!newName.trim()) return
    setBusy(true)
    const r = await fetch('/api/admin/todo-statuses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor, is_done: newIsDone }),
    })
    if (r.ok) {
      const d = await r.json()
      setStatuses(prev => [...prev, d.status])
      setNewName(''); setNewColor('#3b82f6'); setNewIsDone(false); setCreating(false)
    } else { setMsg('Could not create.') }
    setBusy(false)
  }

  async function update(id: string, patch: Partial<TodoStatus>) {
    setBusy(true)
    setStatuses(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    await fetch(`/api/admin/todo-statuses/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    setBusy(false)
  }

  async function setDefault(id: string) {
    setBusy(true)
    setStatuses(prev => prev.map(s => ({ ...s, is_default: s.id === id })))
    await fetch(`/api/admin/todo-statuses/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: true }),
    })
    setBusy(false)
  }

  async function del(id: string) {
    if (statuses.length <= 1) { setMsg('Must keep at least one status.'); return }
    if (!confirm('Delete this status? Todos using it will move to the first active status.')) return
    setBusy(true)
    await fetch(`/api/admin/todo-statuses/${id}`, { method: 'DELETE' })
    setStatuses(prev => prev.filter(s => s.id !== id))
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-red-500">{msg}</p>}

      {statuses.map(s => (
        <div key={s.id} className="bg-white border border-gray-200 rounded-2xl flex items-center gap-3 px-4 py-3">
          <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab" />
          {/* Color picker */}
          <div className="relative flex-shrink-0">
            <div className="w-6 h-6 rounded-full cursor-pointer border-2 border-white ring-2 ring-gray-200" style={{ backgroundColor: s.color }} />
            <input type="color" value={s.color} onChange={e => update(s.id, { color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          </div>
          <input
            value={s.name}
            onChange={e => setStatuses(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
            onBlur={e => update(s.id, { name: e.target.value })}
            className="flex-1 text-sm font-medium text-navy-700 border-0 outline-none bg-transparent"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={s.is_done} onChange={e => update(s.id, { is_done: e.target.checked })} className="rounded text-teal-500" />
            Marks done
          </label>
          <button
            onClick={() => setDefault(s.id)}
            title={s.is_default ? 'Default status' : 'Set as default'}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${s.is_default ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
          >
            {s.is_default ? 'Default' : 'Set default'}
          </button>
          <button onClick={() => del(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {creating ? (
        <div className="bg-white border-2 border-teal-300 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)} className="w-5 h-5 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: newColor === c ? '#0f172a' : 'transparent' }} />
              ))}
            </div>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="Status name…" className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" autoFocus />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer flex-shrink-0">
              <input type="checkbox" checked={newIsDone} onChange={e => setNewIsDone(e.target.checked)} className="rounded text-teal-500" />
              Marks done
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={!newName.trim() || busy} className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors">
          <Plus className="w-4 h-4" /> Add status
        </button>
      )}

      {busy && <p className="text-xs text-gray-400 text-center">Saving…</p>}
    </div>
  )
}

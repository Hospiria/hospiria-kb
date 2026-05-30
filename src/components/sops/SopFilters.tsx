'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  teams: { id: string; name: string }[]
  companies: { id: string; name: string }[]
  platforms: { id: string; name: string }[]
  canFilterByStatus: boolean
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'live', label: 'Live' },
  { value: 'archived', label: 'Archived' },
]

export function SopFilters({ teams, companies, platforms, canFilterByStatus }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const urlSearch = searchParams.get('search') ?? ''
  const [searchValue, setSearchValue] = useState(urlSearch)

  // Keep input in sync if URL search changes from outside (e.g. sidebar nav)
  useEffect(() => {
    setSearchValue(searchParams.get('search') ?? '')
  }, [searchParams.get('search')])  // eslint-disable-line

  // Debounced URL update — fires 300ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchValue.trim()
      if (trimmed === urlSearch) return
      const params = new URLSearchParams(searchParams.toString())
      if (trimmed) {
        params.set('search', trimmed)
      } else {
        params.delete('search')
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    }, 300)
    return () => clearTimeout(t)
  }, [searchValue]) // eslint-disable-line

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  function clearAll() {
    setSearchValue('')
    startTransition(() => {
      router.replace(pathname)
    })
  }

  const activeTeam = searchParams.get('team')
  const activeCompany = searchParams.get('company')
  const activePlatform = searchParams.get('platform')
  const activeStatus = searchParams.get('status')
  const activeSearch = searchParams.get('search')

  const hasActiveFilters = !!(activeTeam || activeCompany || activePlatform || activeStatus || activeSearch)

  const activeTeamName = teams.find(t => t.id === activeTeam)?.name
  const activeCompanyName = companies.find(c => c.id === activeCompany)?.name
  const activePlatformName = platforms.find(p => p.id === activePlatform)?.name

  return (
    <div className="space-y-3 mb-6">
      {/* Search */}
      <div className="relative">
        <Search className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
          isPending ? 'text-teal-400' : 'text-gray-400'
        )} />
        <input
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          placeholder="Search SOPs by title, content, keyword…"
          className={cn(
            'w-full pl-9 pr-9 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white transition-all',
            isPending ? 'border-teal-300 opacity-80' : 'border-gray-200'
          )}
        />
        {searchValue && (
          <button
            onClick={() => setSearchValue('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter dropdowns row */}
      <div className="flex gap-2 flex-wrap items-center">
        <FilterSelect
          label="Team"
          value={activeTeam ?? ''}
          options={teams.map(t => ({ value: t.id, label: t.name }))}
          onChange={v => updateParam('team', v || null)}
        />
        <FilterSelect
          label="Company"
          value={activeCompany ?? ''}
          options={companies.map(c => ({ value: c.id, label: c.name }))}
          onChange={v => updateParam('company', v || null)}
        />
        <FilterSelect
          label="Platform"
          value={activePlatform ?? ''}
          options={platforms.map(p => ({ value: p.id, label: p.name }))}
          onChange={v => updateParam('platform', v || null)}
        />
        {canFilterByStatus && (
          <FilterSelect
            label="Status"
            value={activeStatus ?? ''}
            options={STATUS_OPTIONS}
            onChange={v => updateParam('status', v || null)}
          />
        )}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {(activeTeamName || activeCompanyName || activePlatformName || activeStatus) && (
        <div className="flex gap-2 flex-wrap">
          {activeTeamName && (
            <FilterChip label={`Team: ${activeTeamName}`} onRemove={() => updateParam('team', null)} />
          )}
          {activeCompanyName && (
            <FilterChip label={`Company: ${activeCompanyName}`} onRemove={() => updateParam('company', null)} />
          )}
          {activePlatformName && (
            <FilterChip label={`Platform: ${activePlatformName}`} onRemove={() => updateParam('platform', null)} />
          )}
          {activeStatus && (
            <FilterChip
              label={`Status: ${activeStatus.charAt(0).toUpperCase() + activeStatus.slice(1).replace('_', ' ')}`}
              onRemove={() => updateParam('status', null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function FilterSelect({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'appearance-none text-xs font-medium pl-3 pr-7 py-2 rounded-lg border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400',
          value
            ? 'bg-teal-50 border-teal-300 text-teal-700'
            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
        )}
      >
        <option value="">{label}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-1">
      {label}
      <button onClick={onRemove} className="text-teal-500 hover:text-teal-700 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Profile } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import {
  LayoutDashboard, Users, Building2, Upload,
  ChevronRight, ChevronDown, BookOpen, Users as TeamIcon, PlugZap, ListChecks,
} from 'lucide-react'
import { useState, useEffect } from 'react'

interface Category { id: string; team_id: string; name: string; display_order: number }
interface Team { id: string; name: string }

interface SidebarProps {
  profile: Profile
  teamName?: string
  teams: Team[]
  categories: Category[]
}

export function Sidebar({ profile, teamName, teams, categories }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTeam = searchParams.get('team')
  const activeCategory = searchParams.get('category')
  const isSuperAdmin = profile.role === 'super_admin'

  // Keep teams expanded if they're active
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    teams.forEach(t => { init[t.id] = true }) // default all expanded
    return init
  })

  function toggle(teamId: string) {
    setExpanded(prev => ({ ...prev, [teamId]: !prev[teamId] }))
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-navy-700 flex flex-col z-40">
      {/* Logo */}
      <div className="p-5 border-b border-navy-600">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Hospiria KB</p>
            <p className="text-navy-300 text-xs leading-tight">Knowledge Base</p>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="p-4 border-b border-navy-600">
        <p className="text-white text-sm font-medium truncate">{profile.full_name ?? 'User'}</p>
        <div className="mt-1"><RoleBadge role={profile.role} /></div>
        {teamName && <p className="text-navy-300 text-xs mt-1 truncate">{teamName}</p>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
            pathname === '/dashboard'
              ? 'bg-teal-500 text-white'
              : 'text-navy-200 hover:bg-navy-600 hover:text-white'
          )}
        >
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
          <span>Dashboard</span>
        </Link>

        {/* Teams → Categories */}
        {teams.map(team => {
          const teamCats = categories.filter(c => c.team_id === team.id)
          const isExpanded = expanded[team.id] ?? true
          const isTeamActive = activeTeam === team.id

          return (
            <div key={team.id}>
              {/* Team header — click to expand/collapse */}
              <button
                onClick={() => toggle(team.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                  isTeamActive
                    ? 'text-white'
                    : 'text-navy-200 hover:bg-navy-600 hover:text-white'
                )}
              >
                <TeamIcon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left font-medium">{team.name}</span>
                {isExpanded
                  ? <ChevronDown className="w-3 h-3 opacity-60" />
                  : <ChevronRight className="w-3 h-3 opacity-60" />
                }
              </button>

              {/* Categories under team */}
              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-navy-600 pl-3">
                  {teamCats.map(cat => {
                    const active = activeTeam === team.id && activeCategory === cat.id
                    return (
                      <Link
                        key={cat.id}
                        href={`/sops?team=${team.id}&category=${cat.id}`}
                        className={cn(
                          'flex items-center px-2 py-1.5 rounded-lg text-xs transition-all',
                          active
                            ? 'bg-teal-500 text-white font-medium'
                            : 'text-navy-300 hover:bg-navy-600 hover:text-white'
                        )}
                      >
                        <span className="truncate">{cat.name}</span>
                      </Link>
                    )
                  })}
                  {teamCats.length === 0 && (
                    <p className="text-xs text-navy-500 px-2 py-1">No categories</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Admin section */}
        {isSuperAdmin && (
          <>
            <div className="pt-4 pb-1 px-2">
              <p className="text-navy-400 text-xs font-semibold uppercase tracking-wider">Admin</p>
            </div>
            {[
              { label: 'Users', href: '/admin/users', icon: Users },
              { label: 'Teams & Categories', href: '/admin/teams', icon: Building2 },
              { label: 'Import SOPs', href: '/admin/import', icon: Upload },
              { label: 'Import from ClickUp', href: '/admin/clickup', icon: PlugZap },
              { label: 'Manage SOPs', href: '/admin/sops', icon: ListChecks },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                  pathname.startsWith(item.href)
                    ? 'bg-teal-500 text-white'
                    : 'text-navy-200 hover:bg-navy-600 hover:text-white'
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
                {pathname.startsWith(item.href) && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-navy-600">
        <p className="text-navy-400 text-xs text-center">Hospiria © 2025</p>
      </div>
    </aside>
  )
}

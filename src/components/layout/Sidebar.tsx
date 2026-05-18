'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Profile } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import {
  LayoutDashboard, Users, Building2, Upload,
  ChevronRight, ChevronDown, BookOpen, Users as TeamIcon, PlugZap, ListChecks, GraduationCap,
} from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const activeTeam = searchParams.get('team')
  const activeCategory = searchParams.get('category')
  const isSuperAdmin = profile.role === 'super_admin'

  function navigate(href: string) {
    router.push(href)
    router.refresh()
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    teams.forEach(t => { init[t.id] = true })
    return init
  })

  function toggle(teamId: string) {
    setExpanded(prev => ({ ...prev, [teamId]: !prev[teamId] }))
  }

  const initials = (profile.full_name ?? 'U')
    .split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-navy-900 flex flex-col z-40 border-r border-white/5">

      {/* Logo */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-teal-500/25">
            <BookOpen className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm tracking-tight leading-tight">Hospiria KB</p>
            <p className="text-white/35 text-xs leading-tight">Knowledge Base</p>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-navy-700 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-xs font-bold tracking-wide">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-semibold truncate leading-tight">{profile.full_name ?? 'User'}</p>
            <div className="mt-1"><RoleBadge role={profile.role} /></div>
          </div>
        </div>
        {teamName && (
          <p className="text-white/30 text-xs mt-2 truncate font-medium">{teamName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard"
          active={pathname === '/dashboard'} />

        <NavItem href="/quizzes" icon={GraduationCap} label="My Courses"
          active={pathname === '/quizzes' || pathname.startsWith('/quizzes/')} />

        {/* Library */}
        {teams.length > 0 && (
          <div className="pt-5 pb-2 px-2">
            <p className="text-white/25 text-[10px] font-bold uppercase tracking-[0.15em]">Library</p>
          </div>
        )}

        {teams.map(team => {
          const teamCats = categories.filter(c => c.team_id === team.id)
          const isExpanded = expanded[team.id] ?? true
          const isTeamActive = activeTeam === team.id

          return (
            <div key={team.id}>
              <div className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                isTeamActive ? 'text-white bg-white/10' : 'text-white/55 hover:text-white hover:bg-white/5'
              )}>
                <TeamIcon className="w-4 h-4 flex-shrink-0" />
                <button onClick={() => navigate(`/sops?team=${team.id}`)} className="flex-1 text-left font-medium truncate">
                  {team.name}
                </button>
                <button onClick={() => toggle(team.id)} className="p-0.5 opacity-50 hover:opacity-100 transition-opacity">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5" />
                    : <ChevronRight className="w-3.5 h-3.5" />
                  }
                </button>
              </div>

              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/8 pl-3">
                  {teamCats.map(cat => {
                    const active = activeTeam === team.id && activeCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        onClick={() => navigate(`/sops?team=${team.id}&category=${cat.id}`)}
                        className={cn(
                          'w-full flex items-center px-2.5 py-1.5 rounded-lg text-xs transition-all',
                          active
                            ? 'bg-teal-500/15 text-teal-300 font-semibold border border-teal-500/20'
                            : 'text-white/35 hover:text-white/80 hover:bg-white/5'
                        )}
                      >
                        <span className="truncate">{cat.name}</span>
                        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />}
                      </button>
                    )
                  })}
                  {teamCats.length === 0 && (
                    <p className="text-xs text-white/20 px-2 py-1">No categories</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Admin */}
        {isSuperAdmin && (
          <>
            <div className="pt-5 pb-2 px-2">
              <p className="text-white/25 text-[10px] font-bold uppercase tracking-[0.15em]">Admin</p>
            </div>
            {[
              { label: 'Users', href: '/admin/users', icon: Users },
              { label: 'Teams & Categories', href: '/admin/teams', icon: Building2 },
              { label: 'Import SOPs', href: '/admin/import', icon: Upload },
              { label: 'Import from ClickUp', href: '/admin/clickup', icon: PlugZap },
              { label: 'Manage SOPs', href: '/admin/sops', icon: ListChecks },
              { label: 'Manage Quizzes', href: '/admin/quizzes', icon: GraduationCap },
            ].map(item => (
              <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label}
                active={pathname.startsWith(item.href)} />
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-white/15 text-xs text-center font-medium">Hospiria © 2025</p>
      </div>
    </aside>
  )
}

function NavItem({
  href, icon: Icon, label, active,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group',
        active
          ? 'bg-teal-500/15 text-teal-300 font-semibold border border-teal-500/20'
          : 'text-white/55 hover:text-white hover:bg-white/5'
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0 transition-colors',
        active ? 'text-teal-400' : 'group-hover:text-white'
      )} />
      <span className="truncate">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />}
    </Link>
  )
}

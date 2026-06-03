'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Profile } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import {
  LayoutDashboard, Users, Building2, Upload,
  BookOpen, Users as TeamIcon, PlugZap, ListChecks, GraduationCap,
  Briefcase, Layers, ChevronDown, Search, Library, Tag, Brain, NotebookPen,
} from 'lucide-react'
import { useState } from 'react'
import { FeatureKey, Perm } from '@/lib/permissions'

interface Team { id: string; name: string }

interface SidebarProps {
  profile: Profile
  teamName?: string
  teams: Team[]
  companies: { id: string; name: string }[]
  platforms: { id: string; name: string }[]
  perms: Record<FeatureKey, Perm>
}

export function Sidebar({ profile, teamName, teams, companies, platforms, perms }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTeam = searchParams.get('team')
  const activeCompany = searchParams.get('company')
  const activePlatform = searchParams.get('platform')
  const can = (feature: FeatureKey, level: 'view' | 'edit' = 'view') => {
    const p = perms[feature]
    if (!p) return false
    return level === 'edit' ? p.edit : p.view || p.edit
  }

  // Admin nav items, each gated by a feature permission.
  const adminNav: { label: string; href: string; icon: typeof Users; feature: FeatureKey; level: 'view' | 'edit' }[] = [
    { label: 'Users & Permissions', href: '/admin/users', icon: Users, feature: 'users', level: 'view' },
    { label: 'Teams & Categories', href: '/admin/teams', icon: Building2, feature: 'teams', level: 'view' },
    { label: 'Companies', href: '/admin/companies', icon: Briefcase, feature: 'companies', level: 'view' },
    { label: 'Platforms', href: '/admin/platforms', icon: Layers, feature: 'platforms', level: 'view' },
    { label: 'Import SOPs', href: '/admin/import', icon: Upload, feature: 'import_sops', level: 'edit' },
    { label: 'Import from ClickUp', href: '/admin/clickup', icon: PlugZap, feature: 'import_clickup', level: 'edit' },
    { label: 'Manage SOPs', href: '/admin/sops', icon: ListChecks, feature: 'sops', level: 'edit' },
    { label: 'Auto-tag SOPs', href: '/admin/auto-tag', icon: Tag, feature: 'autotag', level: 'edit' },
    { label: 'AI Training', href: '/admin/ai-training', icon: Brain, feature: 'ai_training', level: 'view' },
    { label: 'Manage Quizzes', href: '/admin/quizzes', icon: GraduationCap, feature: 'quizzes', level: 'edit' },
  ]
  const adminItems = adminNav.filter(item => can(item.feature, item.level))

  // Auto-expand if something in the section is currently active
  const [companiesOpen, setCompaniesOpen] = useState(() => !!activeCompany)
  const [platformsOpen, setPlatformsOpen] = useState(() => !!activePlatform)
  const [companiesSearch, setCompaniesSearch] = useState('')
  const [platformsSearch, setPlatformsSearch] = useState('')

  const filteredCompanies = companiesSearch.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(companiesSearch.toLowerCase()))
    : companies

  const filteredPlatforms = platformsSearch.trim()
    ? platforms.filter(p => p.name.toLowerCase().includes(platformsSearch.toLowerCase()))
    : platforms

  function toggleCompanies() {
    if (companiesOpen) setCompaniesSearch('')
    setCompaniesOpen(o => !o)
  }

  function togglePlatforms() {
    if (platformsOpen) setPlatformsSearch('')
    setPlatformsOpen(o => !o)
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
            <p className="text-white/55 text-xs leading-tight">Knowledge Base</p>
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
          <p className="text-white/60 text-xs mt-2 truncate font-medium">{teamName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard"
          active={pathname === '/dashboard'} />

        {can('notes') && (
          <NavItem href="/notes" icon={NotebookPen} label="Notes & To-dos"
            active={pathname === '/notes' || pathname.startsWith('/notes/')} />
        )}

        <NavItem href="/quizzes" icon={GraduationCap} label="My Courses"
          active={pathname === '/quizzes' || pathname.startsWith('/quizzes/')} />

        {/* Library */}
        <div className="pt-5 pb-2 px-2">
          <p className="text-white/55 text-[10px] font-bold uppercase tracking-[0.15em]">Library</p>
        </div>

        <NavItem
          href="/sops"
          icon={Library}
          label="All SOPs"
          active={pathname === '/sops' && !activeTeam && !activeCompany && !activePlatform}
        />

        {teams.map(team => (
          <NavItem
            key={team.id}
            href={`/sops?team=${team.id}`}
            icon={TeamIcon}
            label={team.name}
            active={activeTeam === team.id}
          />
        ))}

        {/* Companies — collapsible with search */}
        {companies.length > 0 && (
          <div className="pt-4">
            <button
              onClick={toggleCompanies}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-2 rounded-lg border transition-all group',
                companiesOpen
                  ? 'bg-white/8 border-white/12 text-white'
                  : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/12 text-white/70 hover:text-white'
              )}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">Companies</span>
                <span className="text-[10px] text-white/35 font-normal normal-case">
                  {activeCompany && !companiesOpen ? '●' : companies.length}
                </span>
              </div>
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-white/50 transition-transform duration-200',
                companiesOpen ? 'rotate-0' : '-rotate-90'
              )} />
            </button>

            {companiesOpen && (
              <div className="mt-1 space-y-0.5">
                {/* Search */}
                <div className="px-1 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                    <input
                      type="text"
                      value={companiesSearch}
                      onChange={e => setCompaniesSearch(e.target.value)}
                      placeholder="Search companies…"
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-teal-500/40 focus:bg-white/8 transition-colors"
                    />
                  </div>
                </div>
                {filteredCompanies.map(company => (
                  <NavItem
                    key={company.id}
                    href={`/sops?company=${company.id}`}
                    icon={Briefcase}
                    label={company.name}
                    active={activeCompany === company.id}
                  />
                ))}
                {filteredCompanies.length === 0 && (
                  <p className="text-xs text-white/30 px-3 py-1.5 italic">No matches</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Platforms — collapsible with search */}
        {platforms.length > 0 && (
          <div className="pt-2">
            <button
              onClick={togglePlatforms}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-2 rounded-lg border transition-all group',
                platformsOpen
                  ? 'bg-white/8 border-white/12 text-white'
                  : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/12 text-white/70 hover:text-white'
              )}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">Platforms</span>
                <span className="text-[10px] text-white/35 font-normal normal-case">
                  {activePlatform && !platformsOpen ? '●' : platforms.length}
                </span>
              </div>
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-white/50 transition-transform duration-200',
                platformsOpen ? 'rotate-0' : '-rotate-90'
              )} />
            </button>

            {platformsOpen && (
              <div className="mt-1 space-y-0.5">
                {/* Search */}
                <div className="px-1 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                    <input
                      type="text"
                      value={platformsSearch}
                      onChange={e => setPlatformsSearch(e.target.value)}
                      placeholder="Search platforms…"
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-teal-500/40 focus:bg-white/8 transition-colors"
                    />
                  </div>
                </div>
                {filteredPlatforms.map(platform => (
                  <NavItem
                    key={platform.id}
                    href={`/sops?platform=${platform.id}`}
                    icon={Layers}
                    label={platform.name}
                    active={activePlatform === platform.id}
                  />
                ))}
                {filteredPlatforms.length === 0 && (
                  <p className="text-xs text-white/30 px-3 py-1.5 italic">No matches</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Admin */}
        {adminItems.length > 0 && (
          <>
            <div className="pt-5 pb-2 px-2">
              <p className="text-white/55 text-[10px] font-bold uppercase tracking-[0.15em]">Admin</p>
            </div>
            {adminItems.map(item => (
              <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label}
                active={pathname.startsWith(item.href)} />
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-white/45 text-xs text-center font-medium">Hospiria © 2025</p>
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
          : 'text-white/80 hover:text-white hover:bg-white/5'
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

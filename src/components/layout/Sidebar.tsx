'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Profile } from '@/types'
import { RoleBadge } from '@/components/ui/StatusBadge'
import {
  LayoutDashboard, Users, Building2, Upload,
  BookOpen, Users as TeamIcon, PlugZap, ListChecks, GraduationCap,
  Briefcase, Layers,
} from 'lucide-react'

interface Team { id: string; name: string }

interface SidebarProps {
  profile: Profile
  teamName?: string
  teams: Team[]
  companies: { id: string; name: string }[]
  platforms: { id: string; name: string }[]
}

export function Sidebar({ profile, teamName, teams, companies, platforms }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTeam = searchParams.get('team')
  const activeCompany = searchParams.get('company')
  const activePlatform = searchParams.get('platform')
  const isSuperAdmin = profile.role === 'super_admin'

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

        <NavItem href="/quizzes" icon={GraduationCap} label="My Courses"
          active={pathname === '/quizzes' || pathname.startsWith('/quizzes/')} />

        {/* Library — Teams */}
        {teams.length > 0 && (
          <div className="pt-5 pb-2 px-2">
            <p className="text-white/55 text-[10px] font-bold uppercase tracking-[0.15em]">Library</p>
          </div>
        )}

        {teams.map(team => (
          <NavItem
            key={team.id}
            href={`/sops?team=${team.id}`}
            icon={TeamIcon}
            label={team.name}
            active={activeTeam === team.id}
          />
        ))}

        {/* Companies */}
        {companies.length > 0 && (
          <>
            <div className="pt-4 pb-2 px-2">
              <p className="text-white/55 text-[10px] font-bold uppercase tracking-[0.15em]">Companies</p>
            </div>
            {companies.map(company => (
              <NavItem
                key={company.id}
                href={`/sops?company=${company.id}`}
                icon={Briefcase}
                label={company.name}
                active={activeCompany === company.id}
              />
            ))}
          </>
        )}

        {/* Platforms */}
        {platforms.length > 0 && (
          <>
            <div className="pt-4 pb-2 px-2">
              <p className="text-white/55 text-[10px] font-bold uppercase tracking-[0.15em]">Platforms</p>
            </div>
            {platforms.map(platform => (
              <NavItem
                key={platform.id}
                href={`/sops?platform=${platform.id}`}
                icon={Layers}
                label={platform.name}
                active={activePlatform === platform.id}
              />
            ))}
          </>
        )}

        {/* Admin */}
        {isSuperAdmin && (
          <>
            <div className="pt-5 pb-2 px-2">
              <p className="text-white/55 text-[10px] font-bold uppercase tracking-[0.15em]">Admin</p>
            </div>
            {[
              { label: 'Users', href: '/admin/users', icon: Users },
              { label: 'Teams & Categories', href: '/admin/teams', icon: Building2 },
              { label: 'Companies', href: '/admin/companies', icon: Briefcase },
              { label: 'Platforms', href: '/admin/platforms', icon: Layers },
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

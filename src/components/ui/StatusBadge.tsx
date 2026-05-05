import { cn } from '@/lib/utils'
import { SopStatus } from '@/types'

const STATUS_CONFIG: Record<SopStatus, { label: string; className: string }> = {
  live: { label: 'Live', className: 'bg-green-100 text-green-700 border-green-200' },
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  changes_requested: { label: 'Changes Requested', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-400 border-gray-200' },
}

export function StatusBadge({ status }: { status: SopStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', config.className)}>
      {config.label}
    </span>
  )
}

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  super_admin: { label: 'Super Admin', className: 'bg-navy-100 text-navy-700 border-navy-200' },
  approver: { label: 'Approver', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  author: { label: 'Author', className: 'bg-teal-100 text-teal-700 border-teal-200' },
  agent: { label: 'Agent', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] ?? { label: role, className: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', config.className)}>
      {config.label}
    </span>
  )
}

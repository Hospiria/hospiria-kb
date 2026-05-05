'use client'

import { useRouter } from 'next/navigation'
import { Eye, X } from 'lucide-react'
import { useState } from 'react'

export function ImpersonationBanner({ userName, userRole }: { userName: string; userRole: string }) {
  const router = useRouter()
  const [exiting, setExiting] = useState(false)

  const roleLabels: Record<string, string> = {
    agent: 'Agent',
    author: 'Author',
    approver: 'Approver',
    super_admin: 'Super Admin',
  }

  async function exitImpersonation() {
    setExiting(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    router.push('/admin/users')
    router.refresh()
  }

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between rounded-xl mb-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm">
          Viewing as <span className="font-semibold">{userName}</span>
        </span>
        <span className="bg-amber-600 px-2 py-0.5 rounded-full text-xs font-medium">
          {roleLabels[userRole] ?? userRole}
        </span>
      </div>
      <button
        onClick={exitImpersonation}
        disabled={exiting}
        className="flex items-center gap-1.5 bg-white text-amber-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-amber-50 transition-colors disabled:opacity-60"
      >
        <X className="w-3 h-3" />
        {exiting ? 'Exiting…' : 'Exit View'}
      </button>
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PermissionsManager } from '@/components/admin/PermissionsManager'

export default async function PermissionsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-navy-700 mb-1">Permissions</h1>
      <p className="text-sm text-gray-500 mb-6">
        Set what each role can view and edit, and override individual people. Roles stay as the user type;
        most users inherit their role, and you tune exceptions here.
      </p>
      <PermissionsManager users={(users ?? []) as { id: string; full_name: string | null; role: string }[]} />
    </div>
  )
}

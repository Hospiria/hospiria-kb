export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatusManager } from '@/components/admin/StatusManager'

export default async function AdminStatusesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const { data: statuses } = await supabase.from('todo_statuses').select('*').order('position')
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-navy-700 mb-1">To-do Statuses</h1>
      <p className="text-sm text-gray-500 mb-6">Configure the status options available for all to-dos. Drag to reorder.</p>
      <StatusManager initialStatuses={statuses ?? []} />
    </div>
  )
}

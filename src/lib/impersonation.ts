import { cookies } from 'next/headers'
import { createClient } from './supabase/server'

export async function getEffectiveSession() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: realProfile } = await supabase
    .from('profiles')
    .select('*, teams(name)')
    .eq('id', user.id)
    .single()

  if (!realProfile) return null

  const impersonateId = cookies().get('impersonate_user_id')?.value

  if (impersonateId && realProfile.role === 'super_admin' && impersonateId !== user.id) {
    const { data: impersonatedProfile } = await supabase
      .from('profiles')
      .select('*, teams(name)')
      .eq('id', impersonateId)
      .single()

    if (impersonatedProfile) {
      return {
        realUserId: user.id,
        effectiveUserId: impersonateId,
        profile: impersonatedProfile,
        realProfile,
        isImpersonating: true as const,
      }
    }
  }

  return {
    realUserId: user.id,
    effectiveUserId: user.id,
    profile: realProfile,
    realProfile,
    isImpersonating: false as const,
  }
}

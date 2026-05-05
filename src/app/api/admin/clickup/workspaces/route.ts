import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = request.headers.get('x-clickup-token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const res = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  })

  if (!res.ok) return NextResponse.json({ error: 'Invalid ClickUp token' }, { status: 401 })

  const data = await res.json()
  return NextResponse.json({ workspaces: data.teams ?? [] })
}

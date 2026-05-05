import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = request.headers.get('x-clickup-token')
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')

  if (!token || !workspaceId) return NextResponse.json({ error: 'Token and workspaceId required' }, { status: 400 })

  const res = await fetch(`https://api.clickup.com/api/v2/team/${workspaceId}/space?archived=false`, {
    headers: { Authorization: token },
  })

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: res.status })

  const data = await res.json()
  return NextResponse.json({ spaces: data.spaces ?? [] })
}

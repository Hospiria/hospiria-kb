import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await requireFeature('import_clickup', 'edit')
  if ('error' in auth) return auth.error

  const token = request.headers.get('x-clickup-token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const res = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  })

  if (!res.ok) return NextResponse.json({ error: 'Invalid ClickUp token' }, { status: 401 })

  const data = await res.json()
  return NextResponse.json({ workspaces: data.teams ?? [] })
}

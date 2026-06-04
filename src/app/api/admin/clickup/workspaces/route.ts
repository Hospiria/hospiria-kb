import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await requireFeature('import_clickup', 'edit')
  if ('error' in auth) return auth.error

  const rawToken = request.headers.get('x-clickup-token')
  if (!rawToken) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  // Trim whitespace — a common paste issue
  const token = rawToken.trim()

  const res = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  })

  if (!res.ok) {
    let detail = ''
    try { const body = await res.json(); detail = body?.err ?? body?.error ?? '' } catch {}
    return NextResponse.json(
      { error: `ClickUp rejected the token (HTTP ${res.status})${detail ? ': ' + detail : ''}. Make sure you copied the full Personal API Token from ClickUp → Profile → Apps.` },
      { status: 401 }
    )
  }

  const data = await res.json()
  return NextResponse.json({ workspaces: data.teams ?? [] })
}

export const maxDuration = 60

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface Assignment {
  sopId: string
  companyIds: string[]
}

// POST — write the confirmed SOP→company tags into the sop_companies junction.
// Idempotent: upserts on the (sop_id, company_id) primary key and ignores
// duplicates, so re-applying the same set is a no-op.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const assignments: Assignment[] = Array.isArray(body.assignments) ? body.assignments : []

  const rows: { sop_id: string; company_id: string }[] = []
  for (const a of assignments) {
    if (!a?.sopId || !Array.isArray(a.companyIds)) continue
    for (const companyId of a.companyIds) {
      if (companyId) rows.push({ sop_id: a.sopId, company_id: companyId })
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, applied: 0, sops: 0 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('sop_companies')
    .upsert(rows, { onConflict: 'sop_id,company_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    applied: rows.length,
    sops: new Set(rows.map(r => r.sop_id)).size,
  })
}

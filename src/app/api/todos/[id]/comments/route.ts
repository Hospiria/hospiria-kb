import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

interface CommentRow {
  id: string; todo_id: string; author_id: string; parent_id: string | null
  body: string; created_at: string; updated_at: string
}

// GET — all comments for a todo, with author names, nested under parents
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { data, error } = await supabase
    .from('todo_comments')
    .select('id, todo_id, author_id, parent_id, body, created_at, updated_at')
    .eq('todo_id', params.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as CommentRow[]
  const authorIds = [...new Set(rows.map(r => r.author_id))]
  const db = createServiceClient()
  const { data: people } = authorIds.length
    ? await db.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] }
  const nameById = new Map((people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

  const comments = rows.map(c => ({
    ...c,
    authorName: nameById.get(c.author_id) ?? 'User',
    mine: c.author_id === auth.userId,
  }))
  return NextResponse.json({ comments })
}

// POST — add a comment (or reply)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const body = (b.body ?? '').toString().trim()
  if (!body) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 })
  const parentId = b.parentId || null

  const { data, error } = await supabase.from('todo_comments')
    .insert({ todo_id: params.id, author_id: auth.userId, parent_id: parentId, body })
    .select('id, todo_id, author_id, parent_id, body, created_at, updated_at').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  // Notify todo owner + anyone mentioned
  const { data: todo } = await supabase.from('todos').select('owner_id, title, team_id').eq('id', params.id).single()
  if (todo && todo.owner_id !== auth.userId) {
    const { data: commenter } = await supabase.from('profiles').select('full_name').eq('id', auth.userId).single()
    await supabase.from('notifications').insert({
      user_id: todo.owner_id, type: 'todo_comment',
      message: `${commenter?.full_name ?? 'Someone'} commented on your task: "${(todo.title ?? '').slice(0, 60)}"`,
      link: '/notes',
    })
  }
  // Mention notifications
  if (b.mentionedUserId && b.mentionedUserId !== auth.userId) {
    await supabase.from('notifications').insert({
      user_id: b.mentionedUserId, type: 'todo_mention',
      message: `You were mentioned in a comment on: "${(todo?.title ?? 'a task').slice(0, 60)}"`,
      link: '/notes',
    })
  }

  const db = createServiceClient()
  const { data: me } = await db.from('profiles').select('full_name').eq('id', auth.userId).single()
  return NextResponse.json({ comment: { ...data, authorName: me?.full_name ?? 'User', mine: true } })
}

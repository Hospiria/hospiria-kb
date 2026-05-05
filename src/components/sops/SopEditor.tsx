'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { TiptapContent, Category, Team } from '@/types'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Heading3, Table as TableIcon, Link as LinkIcon,
  Image as ImageIcon, Minus, AlignLeft, Save, Send, Undo, Redo,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SopEditorProps {
  sopId?: string
  initialTitle?: string
  initialContent?: TiptapContent | null
  initialCategoryId?: string | null
  initialTeamIds?: string[]
  initialStatus?: string
  categories: Category[]
  teams: Team[]
  authorId: string
}

export function SopEditor({
  sopId,
  initialTitle = '',
  initialContent,
  initialCategoryId,
  initialTeamIds = [],
  initialStatus = 'draft',
  categories,
  teams,
  authorId,
}: SopEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '')
  const [selectedTeams, setSelectedTeams] = useState<string[]>(initialTeamIds)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Start writing your SOP…' }),
      TextStyle,
      Color,
    ],
    content: initialContent ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
  })

  const toggleTeam = (id: string) => {
    setSelectedTeams(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  async function save(submit = false) {
    if (!editor) return
    if (!title.trim()) { setMessage('Title is required'); return }

    submit ? setSubmitting(true) : setSaving(true)
    setMessage('')

    try {
      const content = editor.getJSON() as TiptapContent
      const status = submit ? 'submitted' : 'draft'

      let id = sopId
      if (sopId) {
        await supabase.from('sops').update({
          title,
          content,
          category_id: categoryId || null,
          status,
          updated_at: new Date().toISOString(),
        }).eq('id', sopId)
      } else {
        const { data } = await supabase.from('sops').insert({
          title,
          content,
          category_id: categoryId || null,
          status,
          author_id: authorId,
        }).select('id').single()
        id = data?.id
      }

      if (id) {
        // Sync team tags
        await supabase.from('sop_teams').delete().eq('sop_id', id)
        if (selectedTeams.length > 0) {
          await supabase.from('sop_teams').insert(
            selectedTeams.map(team_id => ({ sop_id: id!, team_id }))
          )
        }

        // If submitting, notify approvers for each team
        if (submit) {
          for (const teamId of selectedTeams) {
            const { data: approvers } = await supabase
              .from('profiles')
              .select('id')
              .eq('primary_team_id', teamId)
              .in('role', ['approver', 'super_admin'])

            if (approvers) {
              await supabase.from('approvals').insert({
                sop_id: id,
                approver_id: approvers[0]?.id ?? null,
                status: 'pending',
              })
              for (const a of approvers) {
                await supabase.from('notifications').insert({
                  user_id: a.id,
                  type: 'sop_submitted',
                  message: `New SOP submitted for review: "${title}"`,
                  link: `/sops/${id}/approve`,
                })
              }
            }
          }
          router.push(`/sops/${id}`)
        } else {
          router.push(`/sops/${id}`)
        }
      }
    } catch (e) {
      setMessage('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  const setLink = useCallback(() => {
    const url = window.prompt('URL:')
    if (!url) return
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className="flex gap-6 max-w-6xl mx-auto">
      {/* Editor */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="SOP Title"
          className="w-full text-3xl font-bold text-navy-700 placeholder:text-gray-300 border-0 outline-none mb-4 bg-transparent"
        />

        {/* Toolbar */}
        <div className="bg-white border border-gray-200 rounded-xl p-2 mb-0 flex flex-wrap gap-1 sticky top-20 z-10 shadow-sm">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Table">
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Link">
            <LinkIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => {
            const url = window.prompt('Image URL:')
            if (url) editor.chain().focus().setImage({ src: url }).run()
          }} title="Image">
            <ImageIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
            <Minus className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Callout">
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Editor area */}
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl tiptap-editor kb-content min-h-[500px]">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-4">
        {/* Actions */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          {message && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">{message}</p>
          )}
          <button
            onClick={() => save(false)}
            disabled={saving || submitting}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || submitting}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>

        {/* Category */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">No category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {(cat as Category & { teams?: { name: string } }).teams?.name} — {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Teams */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Visible to Teams</label>
          <div className="space-y-2">
            {teams.map(team => (
              <label key={team.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                  className="rounded border-gray-300 text-teal-500 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">{team.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        active ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  )
}

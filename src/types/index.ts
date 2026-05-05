export type Role = 'super_admin' | 'approver' | 'author' | 'agent'

export type SopStatus = 'draft' | 'submitted' | 'changes_requested' | 'live' | 'archived'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested'

export interface Team {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  primary_team_id: string | null
  created_at: string
  teams?: Team
}

export interface TeamAccess {
  id: string
  user_id: string
  team_id: string
  granted_by: string | null
  created_at: string
  teams?: Team
}

export interface Category {
  id: string
  team_id: string
  name: string
  display_order: number
  created_at: string
  teams?: Team
}

export interface Sop {
  id: string
  title: string
  content: TiptapContent | null
  category_id: string | null
  status: SopStatus
  author_id: string | null
  current_version: number
  created_at: string
  updated_at: string
  categories?: Category
  profiles?: Profile
  sop_teams?: { team_id: string; teams?: Team }[]
}

export interface SopVersion {
  id: string
  sop_id: string
  content: TiptapContent
  version_number: number
  created_at: string
  created_by: string | null
  profiles?: Profile
}

export interface Approval {
  id: string
  sop_id: string
  approver_id: string | null
  status: ApprovalStatus
  comment: string | null
  created_at: string
  profiles?: Profile
  sops?: Sop
}

export interface Notification {
  id: string
  user_id: string
  type: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

// Tiptap JSON content structure
export interface TiptapContent {
  type: 'doc'
  content: TiptapNode[]
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

export interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

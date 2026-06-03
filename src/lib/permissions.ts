// Permissions catalogue + code defaults. Pure data — safe to import on both
// client and server. The DB tables (role_permissions, user_permissions) store
// only OVERRIDES on top of these defaults, so today's behaviour is reproduced
// even before any row exists.

import { Role } from '@/types'

export type FeatureKey =
  | 'dashboard'
  | 'sops'
  | 'approve_sops'
  | 'quizzes'
  | 'chat'
  | 'notes'
  | 'companies'
  | 'platforms'
  | 'teams'
  | 'users'
  | 'import_sops'
  | 'import_clickup'
  | 'autotag'
  | 'ai_training'

export type FeatureGroup = 'Core' | 'SOPs' | 'Learning' | 'Admin'

export interface FeatureDef {
  key: FeatureKey
  label: string
  group: FeatureGroup
  /** Whether a "view only" level is meaningful for this feature. */
  hasView: boolean
  /** Whether an "edit/manage" level is meaningful for this feature. */
  hasEdit: boolean
  viewHint?: string
  editHint?: string
}

// The rows shown in the permission grid, in display order.
//
// ⚠️ MAINTENANCE RULE: whenever you add a new feature or admin area to the app
// (a new page, admin section, or capability), ADD A ROW HERE and set its
// defaults in DEFAULT_ROLE_PERMISSIONS below. A feature that isn't listed here
// is invisible to the permission system and (in later phases) cannot be
// granted or restricted. Keep this catalogue in sync with the app.
export const FEATURES: FeatureDef[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Core', hasView: true, hasEdit: false, viewHint: 'See the dashboard' },
  { key: 'chat', label: 'Chat assistant', group: 'Core', hasView: true, hasEdit: false, viewHint: 'Use the assistant' },
  { key: 'notes', label: 'Notes & to-dos', group: 'Core', hasView: true, hasEdit: true, viewHint: 'Open the notes/to-do hub', editHint: 'Create & edit notes and to-dos' },
  { key: 'sops', label: 'SOPs / Library', group: 'SOPs', hasView: true, hasEdit: true, viewHint: 'Read SOPs', editHint: 'Create & edit SOPs' },
  { key: 'approve_sops', label: 'Approve SOPs', group: 'SOPs', hasView: true, hasEdit: true, viewHint: 'See submissions', editHint: 'Approve / reject' },
  { key: 'quizzes', label: 'Courses & Quizzes', group: 'Learning', hasView: true, hasEdit: true, viewHint: 'Take assigned quizzes', editHint: 'Create & manage quizzes' },
  { key: 'users', label: 'Users', group: 'Admin', hasView: true, hasEdit: true, viewHint: 'See user list', editHint: 'Invite / edit users' },
  { key: 'teams', label: 'Teams & Categories', group: 'Admin', hasView: true, hasEdit: true, viewHint: 'See teams', editHint: 'Manage teams & categories' },
  { key: 'companies', label: 'Companies', group: 'Admin', hasView: true, hasEdit: true, viewHint: 'See company tags', editHint: 'Manage company tags' },
  { key: 'platforms', label: 'Platforms', group: 'Admin', hasView: true, hasEdit: true, viewHint: 'See platform tags', editHint: 'Manage platform tags' },
  { key: 'import_sops', label: 'Import SOPs (CSV)', group: 'Admin', hasView: false, hasEdit: true, editHint: 'Run CSV imports' },
  { key: 'import_clickup', label: 'Import from ClickUp', group: 'Admin', hasView: false, hasEdit: true, editHint: 'Run ClickUp imports' },
  { key: 'autotag', label: 'Auto-tag SOPs', group: 'Admin', hasView: false, hasEdit: true, editHint: 'Run & apply auto-tagging' },
  { key: 'ai_training', label: 'AI Training', group: 'Admin', hasView: true, hasEdit: true, viewHint: 'View bot config', editHint: 'Edit behaviour & teach from chats' },
]

export const FEATURE_KEYS = FEATURES.map(f => f.key)
export const FEATURE_BY_KEY: Record<FeatureKey, FeatureDef> =
  Object.fromEntries(FEATURES.map(f => [f.key, f])) as Record<FeatureKey, FeatureDef>

export const ROLES: Role[] = ['super_admin', 'approver', 'team_leader', 'junior_team_leader', 'agent']
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  approver: 'Approver',
  team_leader: 'Team Leader',
  junior_team_leader: 'Junior Team Leader',
  agent: 'Agent',
}

export interface Perm { view: boolean; edit: boolean }
export type PermMap = Record<FeatureKey, Perm>

const ALL: Perm = { view: true, edit: true }
const VIEW: Perm = { view: true, edit: false }
const NONE: Perm = { view: false, edit: false }

// Code defaults — reproduce today's behaviour (see src/lib/roles.ts + the
// admin sidebar being super_admin-only). Any feature not listed for a role
// falls back to NONE.
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Partial<Record<FeatureKey, Perm>>> = {
  super_admin: {
    dashboard: VIEW, chat: VIEW, notes: ALL, sops: ALL, approve_sops: ALL, quizzes: ALL,
    users: ALL, teams: ALL, companies: ALL, platforms: ALL,
    import_sops: ALL, import_clickup: ALL, autotag: ALL, ai_training: ALL,
  },
  approver: {
    dashboard: VIEW, chat: VIEW, notes: ALL, sops: ALL, approve_sops: ALL, quizzes: VIEW,
  },
  team_leader: {
    dashboard: VIEW, chat: VIEW, notes: ALL, sops: ALL, approve_sops: ALL, quizzes: VIEW,
  },
  junior_team_leader: {
    dashboard: VIEW, chat: VIEW, notes: ALL, sops: ALL, approve_sops: NONE, quizzes: VIEW,
  },
  agent: {
    dashboard: VIEW, chat: VIEW, notes: ALL, sops: VIEW, approve_sops: NONE, quizzes: VIEW,
  },
}

/** Normalise so edit always implies view (an editor can necessarily see it). */
export function normalisePerm(p: Perm): Perm {
  return { view: p.view || p.edit, edit: p.edit }
}

/** The built-in default for a role+feature, before any DB override. */
export function defaultPerm(role: Role, feature: FeatureKey): Perm {
  const f = FEATURE_BY_KEY[feature]
  const base = DEFAULT_ROLE_PERMISSIONS[role]?.[feature] ?? NONE
  // Strip levels the feature doesn't support; edit implies view.
  return {
    view: f?.hasView ? base.view || base.edit : false,
    edit: f?.hasEdit ? base.edit : false,
  }
}

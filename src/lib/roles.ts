import { Role } from '@/types'

// Who can create new SOPs
export const CAN_CREATE_SOP: Role[] = ['super_admin', 'approver', 'team_leader', 'junior_team_leader']

// Who can approve SOPs
export const CAN_APPROVE_SOP: Role[] = ['super_admin', 'approver', 'team_leader']

// Who can edit ANY SOP (not just their own)
export const CAN_EDIT_ANY_SOP: Role[] = ['super_admin', 'approver']

// Who can see version history and drafts from others
export const CAN_SEE_ALL_DRAFTS: Role[] = ['super_admin', 'approver', 'team_leader']

export function canCreateSop(role: Role): boolean {
  return CAN_CREATE_SOP.includes(role)
}

export function canApproveSop(role: Role): boolean {
  return CAN_APPROVE_SOP.includes(role)
}

export function canEditAnySop(role: Role): boolean {
  return CAN_EDIT_ANY_SOP.includes(role)
}

export function canSeeAllDrafts(role: Role): boolean {
  return CAN_SEE_ALL_DRAFTS.includes(role)
}

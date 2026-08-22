import type { WorkspaceSectionId } from '../../core/workspace'
import type { ProductView } from './types'
import { isNodeSection } from './mobileWorkspaceNavigationModel'

export interface ProductNavigationState {
  view: ProductView
  workspaceSection: WorkspaceSectionId
  lastNodeSection: WorkspaceSectionId
}

export type ProductNavigationAction =
  | { type: 'set-view'; view: ProductView }
  | { type: 'open-section'; section: WorkspaceSectionId }

export const initialProductNavigationState: ProductNavigationState = {
  view: 'workspace',
  workspaceSection: 'overview',
  lastNodeSection: 'proxies',
}

export function productNavigationReducer(
  state: ProductNavigationState,
  action: ProductNavigationAction,
): ProductNavigationState {
  if (action.type === 'set-view') return { ...state, view: action.view }
  return {
    view: 'workspace',
    workspaceSection: action.section,
    lastNodeSection: isNodeSection(action.section) ? action.section : state.lastNodeSection,
  }
}

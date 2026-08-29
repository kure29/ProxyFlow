import type { WorkspaceSectionId } from '../../core/workspace'
import type { ProductView } from './types'
import { isNodeSection } from './mobileWorkspaceNavigationModel'

/**
 * Product-level groupings are presentation metadata only. They intentionally
 * point at the existing workspace sections instead of introducing a second
 * persisted project/navigation model.
 */
export const productNavigationGroups = [
  { id: 'nodes', sections: ['sources', 'proxies', 'processing'] as const },
  { id: 'strategies', sections: ['strategies'] as const },
  { id: 'routing', sections: ['routing'] as const },
  { id: 'output', sections: ['export'] as const },
  { id: 'diagnostics', sections: ['inspect'] as const },
  { id: 'advanced', sections: ['dns'] as const },
] as const

export const productNodeTabs = [
  { section: 'sources', label: 'workspace.subscriptionSources' },
  { section: 'proxies', label: 'workspace.nodeList' },
  { section: 'processing', label: 'workspace.processing' },
] as const

export type ProductNavigationGroupId = typeof productNavigationGroups[number]['id']

export function productNavigationGroupFor(section: WorkspaceSectionId): ProductNavigationGroupId | null {
  return productNavigationGroups.find((group) => (group.sections as readonly WorkspaceSectionId[]).includes(section))?.id ?? null
}

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
  // New projects start with the source-first Nodes workflow. Overview remains
  // a compatibility route, but is no longer a primary product entry point.
  workspaceSection: 'sources',
  lastNodeSection: 'sources',
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

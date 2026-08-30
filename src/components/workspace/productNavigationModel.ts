import type { WorkspaceSectionId } from '../../core/workspace'
import type { GraphNode } from '../../types/project'
import type { ProductView } from './types'
import { isNodeSection } from './mobileWorkspaceNavigationModel'

/**
 * Product-level groupings are presentation metadata only. They intentionally
 * point at the existing workspace sections instead of introducing a second
 * persisted project/navigation model.
 */
export const productNavigationGroups = [
  { id: 'nodes', sections: ['sources', 'proxies'] as const },
  { id: 'processing', sections: ['processing'] as const },
  { id: 'strategies', sections: ['strategies'] as const },
  { id: 'routing', sections: ['routing'] as const },
  { id: 'settings', sections: ['dns'] as const },
  // Keep the existing output/diagnostics group ids stable; only their visible
  // labels and placement are part of this presentation slice.
  { id: 'output', sections: ['export'] as const },
  { id: 'diagnostics', sections: ['inspect'] as const },
] as const

export const productNodeTabs = [
  { section: 'sources', label: 'workspace.subscriptionSources' },
  { section: 'proxies', label: 'workspace.proxyInventory' },
] as const

/** Primary authoring stages, expressed as stable workspace section ids. */
export const productPrimarySections = ['sources', 'processing', 'strategies', 'routing', 'dns', 'export'] as const

/** Secondary project/review surfaces kept reachable outside the authoring flow. */
export const productSecondarySections = ['overview', 'inspect'] as const

export type ProductNavigationGroupId = typeof productNavigationGroups[number]['id']

export function productNavigationGroupFor(section: WorkspaceSectionId): ProductNavigationGroupId | null {
  return productNavigationGroups.find((group) => (group.sections as readonly WorkspaceSectionId[]).includes(section))?.id ?? null
}

export function workspaceSectionForNode(node: Pick<GraphNode, 'data'>): WorkspaceSectionId {
  if (node.data.category === 'source') return 'sources'
  if (node.data.category === 'processing') return 'processing'
  if (node.data.category === 'strategy' || node.data.category === 'chain') return 'strategies'
  if (node.data.category === 'routing') return 'routing'
  if (node.data.category === 'dns') return 'dns'
  if (node.data.category === 'output') return 'export'
  return 'inspect'
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
  // New projects start with the source-first configuration workflow. Overview remains
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

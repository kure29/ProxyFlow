import type { WorkspaceSectionId } from '../../core/workspace'

export type MobilePrimarySection = 'home' | 'nodes' | 'processing' | 'strategies' | 'routing' | 'more'

const nodeSections = new Set<WorkspaceSectionId>(['sources', 'proxies'])
const moreSections = new Set<WorkspaceSectionId>(['dns', 'inspect', 'export'])

export function isNodeSection(section: WorkspaceSectionId) {
  return nodeSections.has(section)
}

export function isMoreSection(section: WorkspaceSectionId) {
  return moreSections.has(section)
}

export function resolveMobilePrimarySection(section: WorkspaceSectionId): MobilePrimarySection {
  if (section === 'overview') return 'home'
  if (isNodeSection(section)) return 'nodes'
  if (section === 'processing') return 'processing'
  if (section === 'strategies') return 'strategies'
  if (section === 'routing') return 'routing'
  return 'more'
}

export function resolveNodeSection(section: WorkspaceSectionId, lastNodeSection: WorkspaceSectionId = 'sources'): WorkspaceSectionId {
  return isNodeSection(section) ? section : isNodeSection(lastNodeSection) ? lastNodeSection : 'sources'
}

export function activateMobileWorkspaceSection(
  section: WorkspaceSectionId,
  onSectionChange: (section: WorkspaceSectionId) => void,
  onClose: () => void,
) {
  onSectionChange(section)
  onClose()
}

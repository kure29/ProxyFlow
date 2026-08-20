import type { WorkspaceSectionId } from '../../core/workspace'

export type ProductView = 'workspace' | 'visual-flow'

export interface WorkspaceNavigationState {
  activeSection: WorkspaceSectionId
  onSectionChange: (section: WorkspaceSectionId) => void
}

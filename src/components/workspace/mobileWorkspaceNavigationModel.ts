import type { WorkspaceSectionId } from '../../core/workspace'

export function activateMobileWorkspaceSection(
  section: WorkspaceSectionId,
  onSectionChange: (section: WorkspaceSectionId) => void,
  onClose: () => void,
) {
  onSectionChange(section)
  onClose()
}

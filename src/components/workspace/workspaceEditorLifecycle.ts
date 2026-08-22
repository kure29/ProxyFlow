import type { WorkspaceSectionId } from '../../core/workspace'

export function shouldDismissWorkspaceEditor(
  previousSection: WorkspaceSectionId,
  nextSection: WorkspaceSectionId,
) {
  return previousSection !== nextSection
}

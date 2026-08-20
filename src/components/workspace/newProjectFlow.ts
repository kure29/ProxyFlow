import type { BlockType } from '../../types/project'

export const NEW_PROJECT_SOURCE_CHOICES = ['url', 'paste', 'file', 'empty'] as const
export type NewProjectSourceChoice = typeof NEW_PROJECT_SOURCE_CHOICES[number]

export function sourceBlockForNewProject(choice: NewProjectSourceChoice): BlockType | undefined {
  if (choice === 'url') return 'subscription'
  if (choice === 'paste') return 'manual-proxy'
  if (choice === 'file') return 'import-config'
  return undefined
}

import type { ProxyFlowProject } from '../../types/project'

export const PROJECT_SCHEMA_VERSION = 1 as const

export interface ProjectMigrationResult {
  success: boolean
  project?: ProxyFlowProject
  fromVersion: number
  toVersion: typeof PROJECT_SCHEMA_VERSION
  message?: string
}

/**
 * V0.2 has no historical schema migration yet. This stable boundary prevents
 * persistence code from silently accepting an unknown future project schema.
 */
export function migrateProject(project: ProxyFlowProject): ProjectMigrationResult {
  if (project.version === PROJECT_SCHEMA_VERSION) return {
    success: true,
    project,
    fromVersion: project.version,
    toVersion: PROJECT_SCHEMA_VERSION,
  }
  return {
    success: false,
    fromVersion: project.version,
    toVersion: PROJECT_SCHEMA_VERSION,
    message: `Unsupported project schema version ${project.version}.`,
  }
}

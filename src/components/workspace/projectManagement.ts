import type { ProxyFlowProject } from '../../types/project'
import type { ProjectListItem, ProjectStorage } from '../../storage/projectStorage'

export interface DeleteProjectResult {
  nextProject: ProxyFlowProject | null
  projects: ProjectListItem[]
}

export async function deleteStoredProject(
  storage: ProjectStorage,
  projectId: string,
  activeProjectId: string,
): Promise<DeleteProjectResult> {
  await storage.clear(projectId)
  const projects = await storage.list()
  if (projectId !== activeProjectId) return { nextProject: null, projects }
  const nextProject = await storage.load()
  return { nextProject, projects }
}

import type { ProxyFlowProject } from '../types/project'

export interface ProjectListItem {
  id: string
  name: string
  updatedAt: string
  primaryTarget?: ProxyFlowProject['primaryTarget']
  active: boolean
}

export interface ProjectSaveOptions {
  activate?: boolean
}

export interface ProjectStorage {
  load(projectId?: string): Promise<ProxyFlowProject | null>
  list(): Promise<ProjectListItem[]>
  activate(projectId: string): Promise<ProxyFlowProject | null>
  save(project: ProxyFlowProject, options?: ProjectSaveOptions): Promise<void>
  clear(projectId?: string): Promise<void>
}

const LEGACY_STORAGE_KEY = 'proxyflow.project.v1'
const INDEX_STORAGE_KEY = 'proxyflow.projects.index.v1'
const PROJECT_STORAGE_PREFIX = 'proxyflow.projects.item.v1.'

interface StoredProjectIndex {
  version: 1
  activeProjectId: string | null
  projectIds: string[]
}

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const emptyIndex = (): StoredProjectIndex => ({ version: 1, activeProjectId: null, projectIds: [] })
const projectKey = (projectId: string) => `${PROJECT_STORAGE_PREFIX}${encodeURIComponent(projectId)}`

function parseIndex(value: string): StoredProjectIndex {
  const parsed = JSON.parse(value) as Partial<StoredProjectIndex>
  if (parsed.version !== 1 || !Array.isArray(parsed.projectIds)
    || !parsed.projectIds.every((id) => typeof id === 'string')
    || (parsed.activeProjectId !== null && typeof parsed.activeProjectId !== 'string')) {
    throw new Error('The local Project index is unreadable.')
  }
  return { version: 1, activeProjectId: parsed.activeProjectId, projectIds: [...new Set(parsed.projectIds)] }
}

function parseProject(value: string, expectedId?: string): ProxyFlowProject {
  const parsed = JSON.parse(value) as Partial<ProxyFlowProject>
  if (typeof parsed.id !== 'string' || !parsed.id || (expectedId && parsed.id !== expectedId)
    || typeof parsed.name !== 'string' || typeof parsed.version !== 'number' || !parsed.graph) {
    throw new Error('The local Project is unreadable.')
  }
  return parsed as ProxyFlowProject
}

export class LocalProjectStorage implements ProjectStorage {
  constructor(private readonly providedStorage?: WebStorage) {}

  private get storage() {
    return this.providedStorage ?? window.localStorage
  }

  private readIndex() {
    const current = this.storage.getItem(INDEX_STORAGE_KEY)
    if (current) return parseIndex(current)

    const legacy = this.storage.getItem(LEGACY_STORAGE_KEY)
    if (!legacy) return emptyIndex()
    const project = parseProject(legacy)
    const index: StoredProjectIndex = { version: 1, activeProjectId: project.id, projectIds: [project.id] }
    this.storage.setItem(projectKey(project.id), JSON.stringify(project))
    this.storage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index))
    this.storage.removeItem(LEGACY_STORAGE_KEY)
    return index
  }

  private writeIndex(index: StoredProjectIndex) {
    this.storage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index))
  }

  async load(projectId?: string) {
    const index = this.readIndex()
    const id = projectId ?? index.activeProjectId
    if (!id || !index.projectIds.includes(id)) return null
    const value = this.storage.getItem(projectKey(id))
    return value ? parseProject(value, id) : null
  }

  async list() {
    const index = this.readIndex()
    return index.projectIds.flatMap((id): ProjectListItem[] => {
      const value = this.storage.getItem(projectKey(id))
      if (!value) return []
      try {
        const project = parseProject(value, id)
        return [{
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt,
          ...(project.primaryTarget ? { primaryTarget: project.primaryTarget } : {}),
          active: project.id === index.activeProjectId,
        }]
      } catch {
        return []
      }
    })
  }

  async activate(projectId: string) {
    const index = this.readIndex()
    if (!index.projectIds.includes(projectId)) return null
    const project = await this.load(projectId)
    if (!project) return null
    this.writeIndex({ ...index, activeProjectId: projectId })
    return project
  }

  async save(project: ProxyFlowProject, options: ProjectSaveOptions = {}) {
    const index = this.readIndex()
    this.storage.setItem(projectKey(project.id), JSON.stringify(project))
    this.writeIndex({
      version: 1,
      activeProjectId: options.activate === false ? index.activeProjectId ?? project.id : project.id,
      projectIds: [project.id, ...index.projectIds.filter((id) => id !== project.id)],
    })
  }

  async clear(projectId?: string) {
    const index = this.readIndex()
    if (!projectId) {
      for (const id of index.projectIds) this.storage.removeItem(projectKey(id))
      this.storage.removeItem(INDEX_STORAGE_KEY)
      this.storage.removeItem(LEGACY_STORAGE_KEY)
      return
    }
    if (!index.projectIds.includes(projectId)) return
    this.storage.removeItem(projectKey(projectId))
    const projectIds = index.projectIds.filter((id) => id !== projectId)
    this.writeIndex({ version: 1, activeProjectId: index.activeProjectId === projectId ? projectIds[0] ?? null : index.activeProjectId, projectIds })
  }
}

export class MemoryProjectStorage implements ProjectStorage {
  private projects = new Map<string, ProxyFlowProject>()
  private activeProjectId: string | null = null

  async load(projectId = this.activeProjectId ?? undefined) {
    const project = projectId ? this.projects.get(projectId) : undefined
    return project ? structuredClone(project) : null
  }

  async list() {
    return [...this.projects.values()].reverse().map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      ...(project.primaryTarget ? { primaryTarget: project.primaryTarget } : {}),
      active: project.id === this.activeProjectId,
    }))
  }

  async activate(projectId: string) {
    const project = this.projects.get(projectId)
    if (!project) return null
    this.activeProjectId = projectId
    return structuredClone(project)
  }

  async save(project: ProxyFlowProject, options: ProjectSaveOptions = {}) {
    this.projects.delete(project.id)
    this.projects.set(project.id, structuredClone(project))
    if (options.activate !== false || this.activeProjectId === null) this.activeProjectId = project.id
  }

  async clear(projectId?: string) {
    if (!projectId) {
      this.projects.clear()
      this.activeProjectId = null
      return
    }
    this.projects.delete(projectId)
    if (this.activeProjectId === projectId) this.activeProjectId = this.projects.keys().next().value ?? null
  }
}

export const projectStorage = new LocalProjectStorage()

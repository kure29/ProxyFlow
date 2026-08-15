import type { ProxyFlowProject } from '../types/project'

export interface ProjectStorage {
  load(): Promise<ProxyFlowProject | null>
  save(project: ProxyFlowProject): Promise<void>
  clear(): Promise<void>
}

const STORAGE_KEY = 'proxyflow.project.v1'

export class LocalProjectStorage implements ProjectStorage {
  async load() {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? (JSON.parse(value) as ProxyFlowProject) : null
  }

  async save(project: ProxyFlowProject) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  }

  async clear() {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

export class MemoryProjectStorage implements ProjectStorage {
  private project: ProxyFlowProject | null = null

  async load() {
    return this.project ? structuredClone(this.project) : null
  }

  async save(project: ProxyFlowProject) {
    this.project = structuredClone(project)
  }

  async clear() {
    this.project = null
  }
}

export const projectStorage = new LocalProjectStorage()

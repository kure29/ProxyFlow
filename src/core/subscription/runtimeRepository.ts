import type { SubscriptionSnapshot } from './types'

export const RUNTIME_STORAGE_SCHEMA_VERSION = 1 as const
export const RUNTIME_DATABASE_NAME = 'proxyflow.runtime.v1'

export interface SubscriptionCacheScope {
  projectId: string
  sourceId: string
  sourceConfigFingerprint: string
}

export interface SubscriptionRuntimeRepository {
  readActive(scope: SubscriptionCacheScope): Promise<SubscriptionSnapshot | undefined>
  writeActive(scope: SubscriptionCacheScope, snapshot: SubscriptionSnapshot): Promise<void>
  deleteActive(scope: SubscriptionCacheScope): Promise<void>
  deleteSource(projectId: string, sourceId: string): Promise<void>
}

interface ActiveMapping extends SubscriptionCacheScope {
  key: string
  snapshotKey: string
  runtimeStorageSchemaVersion: 1
  committedAt: string
}

interface StoredSnapshot {
  key: string
  cacheKey: string
  runtimeStorageSchemaVersion: 1
  snapshot: SubscriptionSnapshot
}

export class IndexedDbSubscriptionRuntimeRepository implements SubscriptionRuntimeRepository {
  constructor(private readonly configuredFactory?: IDBFactory | null) {}

  async readActive(scope: SubscriptionCacheScope) {
    const database = await this.open()
    try {
      const transaction = database.transaction(['active', 'snapshots'], 'readonly')
      const mapping = await request<unknown>(transaction.objectStore('active').get(cacheKey(scope)))
      if (!mapping) {
        await transactionDone(transaction)
        return undefined
      }
      if (!isValidActiveMapping(mapping, scope)) {
        await transactionDone(transaction)
        await this.deleteActive(scope).catch(() => undefined)
        return undefined
      }
      const stored = await request<unknown>(transaction.objectStore('snapshots').get(mapping.snapshotKey))
      await transactionDone(transaction)
      if (!stored || !isValidStoredSnapshot(stored, scope, mapping)) {
        await this.deleteActive(scope).catch(() => undefined)
        return undefined
      }
      return structuredClone(stored.snapshot)
    } finally {
      database.close()
    }
  }

  async writeActive(scope: SubscriptionCacheScope, snapshot: SubscriptionSnapshot) {
    const database = await this.open()
    try {
      const key = cacheKey(scope)
      const snapshotKey = `${key}\u0000${snapshot.snapshotId}`
      const transaction = database.transaction(['active', 'snapshots'], 'readwrite')
      const active = transaction.objectStore('active')
      const snapshots = transaction.objectStore('snapshots')
      const previous = await request<unknown>(active.get(key))
      snapshots.put({ key: snapshotKey, cacheKey: key, runtimeStorageSchemaVersion: RUNTIME_STORAGE_SCHEMA_VERSION, snapshot } satisfies StoredSnapshot)
      active.put({ ...scope, key, snapshotKey, runtimeStorageSchemaVersion: RUNTIME_STORAGE_SCHEMA_VERSION, committedAt: snapshot.committedAt } satisfies ActiveMapping)
      if (isRecord(previous) && typeof previous.snapshotKey === 'string' && belongsToCache(previous.snapshotKey, key) && previous.snapshotKey !== snapshotKey) {
        snapshots.delete(previous.snapshotKey)
      }
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  }

  async deleteActive(scope: SubscriptionCacheScope) {
    const database = await this.open()
    try {
      const key = cacheKey(scope)
      const transaction = database.transaction(['active', 'snapshots'], 'readwrite')
      const active = transaction.objectStore('active')
      const previous = await request<unknown>(active.get(key))
      active.delete(key)
      if (isRecord(previous) && typeof previous.snapshotKey === 'string' && belongsToCache(previous.snapshotKey, key)) {
        transaction.objectStore('snapshots').delete(previous.snapshotKey)
      }
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  }

  async deleteSource(projectId: string, sourceId: string) {
    const database = await this.open()
    try {
      const prefix = `${projectId}\u0000${sourceId}\u0000`
      const transaction = database.transaction(['active', 'snapshots'], 'readwrite')
      const active = transaction.objectStore('active')
      const snapshots = transaction.objectStore('snapshots')
      const mappings = await request<unknown[]>(active.getAll())
      for (const mapping of mappings) {
        if (isRecord(mapping) && typeof mapping.key === 'string' && mapping.key.startsWith(prefix)) active.delete(mapping.key)
      }
      const storedSnapshots = await request<unknown[]>(snapshots.getAll())
      for (const stored of storedSnapshots) {
        if (!isRecord(stored) || typeof stored.key !== 'string' || typeof stored.cacheKey !== 'string') continue
        if (stored.cacheKey.startsWith(prefix) && belongsToCache(stored.key, stored.cacheKey)) snapshots.delete(stored.key)
      }
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  }

  private open() {
    const factory = this.configuredFactory === undefined ? globalThis.indexedDB : this.configuredFactory
    if (!factory) return Promise.reject(new Error('IndexedDB is unavailable.'))
    return new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open(RUNTIME_DATABASE_NAME, RUNTIME_STORAGE_SCHEMA_VERSION)
      open.onupgradeneeded = () => {
        const database = open.result
        if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'key' })
        if (!database.objectStoreNames.contains('active')) database.createObjectStore('active', { keyPath: 'key' })
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed.'))
      open.onblocked = () => reject(new Error('IndexedDB open was blocked.'))
    })
  }
}

export class MemorySubscriptionRuntimeRepository implements SubscriptionRuntimeRepository {
  private readonly snapshots = new Map<string, SubscriptionSnapshot>()
  readError?: Error
  writeError?: Error

  async readActive(scope: SubscriptionCacheScope) {
    if (this.readError) throw this.readError
    const snapshot = this.snapshots.get(cacheKey(scope))
    return snapshot ? structuredClone(snapshot) : undefined
  }

  async writeActive(scope: SubscriptionCacheScope, snapshot: SubscriptionSnapshot) {
    if (this.writeError) throw this.writeError
    this.snapshots.set(cacheKey(scope), structuredClone(snapshot))
  }

  async deleteActive(scope: SubscriptionCacheScope) {
    if (this.writeError) throw this.writeError
    this.snapshots.delete(cacheKey(scope))
  }

  async deleteSource(projectId: string, sourceId: string) {
    const prefix = `${projectId}\u0000${sourceId}\u0000`
    for (const key of this.snapshots.keys()) if (key.startsWith(prefix)) this.snapshots.delete(key)
  }
}

export const subscriptionRuntimeRepository = new IndexedDbSubscriptionRuntimeRepository()

function cacheKey(scope: SubscriptionCacheScope) {
  return `${scope.projectId}\u0000${scope.sourceId}\u0000${scope.sourceConfigFingerprint}`
}

function isValidActiveMapping(value: unknown, scope: SubscriptionCacheScope): value is ActiveMapping {
  const key = cacheKey(scope)
  return isRecord(value)
    && value.runtimeStorageSchemaVersion === RUNTIME_STORAGE_SCHEMA_VERSION
    && value.key === key
    && value.projectId === scope.projectId
    && value.sourceId === scope.sourceId
    && value.sourceConfigFingerprint === scope.sourceConfigFingerprint
    && typeof value.snapshotKey === 'string'
    && belongsToCache(value.snapshotKey, key)
    && isIsoDate(value.committedAt)
}

function isValidStoredSnapshot(stored: unknown, scope: SubscriptionCacheScope, mapping: ActiveMapping): stored is StoredSnapshot {
  if (!isRecord(stored)) return false
  const snapshot = stored.snapshot
  const key = cacheKey(scope)
  return Boolean(
    stored.runtimeStorageSchemaVersion === RUNTIME_STORAGE_SCHEMA_VERSION
    && stored.key === mapping.snapshotKey
    && stored.cacheKey === key
    && isValidSnapshot(snapshot, scope),
  )
}

function isValidSnapshot(value: unknown, scope: SubscriptionCacheScope): value is SubscriptionSnapshot {
  if (!isRecord(value) || !isRecord(value.result)) return false
  const result = value.result
  const formats = new Set(['share-links', 'base64', 'clash-yaml', 'clash-json', 'sub-store-json', 'sing-box-json', 'v2ray-json', 'surge', 'surfboard', 'loon', 'quantumult-x', 'egern', 'stash', 'unsupported'])
  const quality = value.quality
  const detectedCount = result.detectedCount
  const readyCount = result.readyCount
  const partialCount = result.partialCount
  const unsupportedCount = result.unsupportedCount
  if (
    value.snapshotSchemaVersion !== 1
    || value.identityAlgorithmVersion !== 1
    || value.sourceId !== scope.sourceId
    || value.sourceConfigFingerprint !== scope.sourceConfigFingerprint
    || value.inputKind !== 'url'
    || typeof value.snapshotId !== 'string'
    || typeof value.contentHash !== 'string'
    || !isIsoDate(value.createdAt)
    || !isIsoDate(value.fetchedAt)
    || !isIsoDate(value.parsedAt)
    || !isIsoDate(value.committedAt)
    || !formats.has(String(value.format))
    || value.format !== result.format
    || (quality !== 'usable' && quality !== 'empty')
    || !isCount(detectedCount)
    || !isCount(readyCount)
    || !isCount(partialCount)
    || !isCount(unsupportedCount)
    || value.readyCount !== readyCount
    || value.partialCount !== partialCount
    || value.unsupportedCount !== unsupportedCount
    || detectedCount !== readyCount + partialCount + unsupportedCount
    || !Array.isArray(result.nodes)
    || !Array.isArray(result.proxies)
    || !Array.isArray(result.issues)
    || !Array.isArray(value.issues)
    || result.nodes.length !== detectedCount
    || result.proxies.length !== readyCount + partialCount
    || !result.nodes.every(isValidParsedNode)
    || !result.proxies.every(isValidEndpoint)
    || !result.issues.every(isValidIssue)
    || !value.issues.every(isValidIssue)
    || (quality === 'usable' ? readyCount + partialCount < 1 : detectedCount !== 0)
  ) return false
  return value.http === undefined || isValidHttpMetadata(value.http)
}

function isValidParsedNode(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.protocol === 'string'
    && typeof value.sourceId === 'string'
    && typeof value.sourceName === 'string'
    && (value.status === 'ready' || value.status === 'partial' || value.status === 'unsupported')
    && Array.isArray(value.issues)
    && value.issues.every(isValidIssue)
    && (value.server === undefined || typeof value.server === 'string')
    && (value.port === undefined || isPort(value.port))
    && (value.endpoint === undefined || isValidEndpoint(value.endpoint))
}

function isValidEndpoint(value: unknown) {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.server !== 'string'
    || !isPort(value.port)
    || !isValidEndpointMetadata(value.metadata)) return false
  switch (value.protocol) {
    case 'http': return value.kind === 'http' && optionalString(value.username) && optionalString(value.password) && optionalTls(value.tls)
    case 'socks5': return value.kind === 'socks' && value.version === '5' && optionalString(value.username) && optionalString(value.password)
    case 'shadowsocks': return value.kind === 'shadowsocks' && typeof value.method === 'string' && typeof value.password === 'string' && isValidPlugin(value.plugin)
    case 'trojan': return value.kind === 'trojan' && typeof value.password === 'string' && isValidTls(value.tls) && optionalTransport(value.transport)
    case 'vmess': return value.kind === 'vmess' && typeof value.uuid === 'string' && typeof value.security === 'string' && optionalNumber(value.alterId) && optionalTls(value.tls) && optionalTransport(value.transport)
    case 'vless': return value.kind === 'vless' && typeof value.uuid === 'string' && optionalString(value.security) && optionalString(value.encryption) && optionalString(value.flow) && optionalTls(value.tls) && optionalTransport(value.transport)
    case 'hysteria2': return value.kind === 'hysteria2' && typeof value.password === 'string' && isValidTls(value.tls) && optionalNumber(value.upMbps) && optionalNumber(value.downMbps) && isValidServerPorts(value.serverPorts) && isValidHopInterval(value.hopInterval)
    case 'tuic': return value.kind === 'tuic' && typeof value.uuid === 'string' && typeof value.password === 'string' && isValidTls(value.tls) && optionalString(value.congestionControl) && optionalString(value.udpRelayMode)
    case 'anytls': return value.kind === 'anytls' && typeof value.password === 'string' && isValidTls(value.tls) && optionalBoolean(value.udpEnabled) && optionalNumber(value.idleSessionCheckIntervalSeconds) && optionalNumber(value.idleSessionTimeoutSeconds) && optionalNumber(value.minIdleSession)
    default: return false
  }
}

function isValidTls(value: unknown) {
  return isRecord(value)
    && typeof value.enabled === 'boolean'
    && optionalString(value.serverName)
    && optionalBoolean(value.disableSni)
    && optionalBoolean(value.allowInsecure)
    && (value.alpn === undefined || (Array.isArray(value.alpn) && value.alpn.every((item) => typeof item === 'string')))
    && optionalString(value.fingerprint)
    && (value.reality === undefined || (isRecord(value.reality) && typeof value.reality.publicKey === 'string' && optionalString(value.reality.shortId)))
}

function optionalTls(value: unknown) { return value === undefined || isValidTls(value) }

function optionalTransport(value: unknown) {
  if (value === undefined) return true
  if (!isRecord(value) || !['tcp', 'ws', 'http', 'grpc', 'httpupgrade', 'xhttp'].includes(String(value.kind))) return false
  return optionalString(value.path)
    && optionalString(value.host)
    && optionalString(value.serviceName)
    && optionalString(value.mode)
    && optionalString(value.variant)
    && optionalNumber(value.maxEarlyData)
    && optionalString(value.earlyDataHeaderName)
}

function isValidEndpointMetadata(value: unknown) {
  if (value === undefined) return true
  if (!isRecord(value) || !optionalString(value.sourceId) || !optionalString(value.sourceName)) return false
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every((item) => typeof item === 'string'))) return false
  if (value.region !== undefined && (!isRecord(value.region) || typeof value.region.code !== 'string' || typeof value.region.confidence !== 'number' || typeof value.region.source !== 'string')) return false
  return value.compatibility === undefined || (isRecord(value.compatibility)
    && (value.compatibility.status === 'ready' || value.compatibility.status === 'partial')
    && (value.compatibility.unsupportedFeatures === undefined || (Array.isArray(value.compatibility.unsupportedFeatures) && value.compatibility.unsupportedFeatures.every((item) => typeof item === 'string')))
    && (value.compatibility.unrecognizedParams === undefined || (Array.isArray(value.compatibility.unrecognizedParams) && value.compatibility.unrecognizedParams.every((item) => typeof item === 'string'))))
}

function isValidPlugin(value: unknown) {
  if (value === undefined) return true
  return isRecord(value) && typeof value.name === 'string'
    && (value.options === undefined || typeof value.options === 'string' || isRecord(value.options))
}

function isValidServerPorts(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every((item) => isRecord(item) && (
    (item.kind === 'single' && isPort(item.port))
    || (item.kind === 'range' && isPort(item.start) && isPort(item.end) && item.start <= item.end)
  )))
}

function isValidHopInterval(value: unknown) {
  return value === undefined || (isRecord(value) && (
    (value.kind === 'fixed' && typeof value.seconds === 'number')
    || (value.kind === 'range' && typeof value.minSeconds === 'number' && typeof value.maxSeconds === 'number')
  ))
}

function isValidIssue(value: unknown) {
  return isRecord(value)
    && typeof value.code === 'string'
    && (value.severity === 'info' || value.severity === 'warning' || value.severity === 'error')
    && typeof value.message === 'string'
    && optionalString(value.nodeId)
    && optionalString(value.nodeName)
    && (value.line === undefined || isCount(value.line))
}

function isValidHttpMetadata(value: unknown) {
  return isRecord(value)
    && isCount(value.status)
    && optionalString(value.contentType)
    && optionalCount(value.contentLength)
    && optionalCount(value.responseBytes)
    && optionalString(value.etag)
    && optionalString(value.lastModified)
    && typeof value.durationMs === 'number'
    && Number.isFinite(value.durationMs)
    && value.durationMs >= 0
}

function belongsToCache(snapshotKey: string, key: string) { return snapshotKey.startsWith(`${key}\u0000`) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isIsoDate(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function isCount(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0 }
function isPort(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65_535 }
function optionalString(value: unknown) { return value === undefined || typeof value === 'string' }
function optionalNumber(value: unknown) { return value === undefined || (typeof value === 'number' && Number.isFinite(value)) }
function optionalBoolean(value: unknown) { return value === undefined || typeof value === 'boolean' }
function optionalCount(value: unknown) { return value === undefined || isCount(value) }

function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

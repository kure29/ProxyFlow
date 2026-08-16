import type { ParsedSubscriptionNode, SubscriptionChangeType, SubscriptionDiff, SubscriptionDiffEntry, SubscriptionSnapshot, SubscriptionSnapshotCandidate } from './types'
import type { ProxyTlsIR, ResolvedProxyEndpointIR } from '../proxy'
import { sha256 } from './hash'

interface ComparableNode {
  node: ParsedSubscriptionNode
  endpoint?: ResolvedProxyEndpointIR
  index: number
  principal?: string
  connectionAnchor?: string
}

const CHANGE_ORDER: SubscriptionChangeType[] = ['renamed', 'authentication', 'connection', 'metadata', 'readiness']

export async function diffSubscriptionSnapshots(
  oldSnapshot: SubscriptionSnapshot | undefined,
  nextSnapshot: SubscriptionSnapshotCandidate,
): Promise<SubscriptionDiff> {
  if (!oldSnapshot) return {
    newSnapshotId: nextSnapshot.snapshotId,
    isInitialBaseline: true,
    entries: [],
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    issues: [],
  }

  const oldNodes = await comparableNodes(oldSnapshot.result.nodes, oldSnapshot.sourceId)
  const newNodes = await comparableNodes(nextSnapshot.result.nodes, nextSnapshot.sourceId)
  const matchedOld = new Set<number>()
  const matchedNew = new Set<number>()
  const pairs: Array<[ComparableNode, ComparableNode, string]> = []
  let ambiguous = false

  matchUnique(oldNodes, newNodes, matchedOld, matchedNew, (item) => item.principal, pairs, () => { ambiguous = true })
  matchUnique(oldNodes, newNodes, matchedOld, matchedNew, (item) => item.connectionAnchor, pairs, () => { ambiguous = true })

  const entries: SubscriptionDiffEntry[] = []
  for (const [oldItem, newItem, identity] of pairs) entries.push(comparePair(oldItem, newItem, identity))
  for (const item of oldNodes.filter(({ index }) => !matchedOld.has(index))) entries.push({
    kind: 'removed', identity: await opaqueNodeIdentity(item, oldSnapshot.sourceId), name: item.node.name, changeTypes: [], changedFields: [],
  })
  for (const item of newNodes.filter(({ index }) => !matchedNew.has(index))) entries.push({
    kind: 'added', identity: await opaqueNodeIdentity(item, nextSnapshot.sourceId), name: item.node.name, changeTypes: [], changedFields: [],
  })
  entries.sort(compareEntries)

  return {
    oldSnapshotId: oldSnapshot.snapshotId,
    newSnapshotId: nextSnapshot.snapshotId,
    isInitialBaseline: false,
    entries,
    added: entries.filter((entry) => entry.kind === 'added').length,
    removed: entries.filter((entry) => entry.kind === 'removed').length,
    changed: entries.filter((entry) => entry.kind === 'changed').length,
    unchanged: entries.filter((entry) => entry.kind === 'unchanged').length,
    issues: ambiguous ? [{ code: 'SUBSCRIPTION_IDENTITY_AMBIGUOUS', severity: 'warning', message: 'Multiple nodes shared the same continuity identity; ambiguous matches were reported as removed and added.' }] : [],
  }
}

async function comparableNodes(nodes: ParsedSubscriptionNode[], sourceId: string): Promise<ComparableNode[]> {
  return Promise.all(nodes.map(async (node, index) => ({
    node,
    endpoint: node.endpoint,
    index,
    ...(node.endpoint ? {
      principal: await stablePrincipal(node.endpoint, sourceId),
      connectionAnchor: await sha256(`${sourceId}\u0000${stableJson(connectionAnchor(node.endpoint))}`),
    } : {}),
  })))
}

async function stablePrincipal(endpoint: ResolvedProxyEndpointIR, sourceId: string): Promise<string | undefined> {
  if (endpoint.protocol === 'vmess' || endpoint.protocol === 'vless' || endpoint.protocol === 'tuic') {
    return sha256(`${sourceId}\u0000uuid\u0000${endpoint.uuid.toLowerCase()}`)
  }
  if ((endpoint.protocol === 'http' || endpoint.protocol === 'socks5') && endpoint.username) {
    return sha256(`${sourceId}\u0000username\u0000${endpoint.username}`)
  }
  return undefined
}

function matchUnique(
  oldNodes: ComparableNode[],
  newNodes: ComparableNode[],
  matchedOld: Set<number>,
  matchedNew: Set<number>,
  keyOf: (item: ComparableNode) => string | undefined,
  pairs: Array<[ComparableNode, ComparableNode, string]>,
  onAmbiguous: () => void,
) {
  const oldGroups = groupUnmatched(oldNodes, matchedOld, keyOf)
  const newGroups = groupUnmatched(newNodes, matchedNew, keyOf)
  for (const [key, oldGroup] of oldGroups) {
    const newGroup = newGroups.get(key)
    if (!newGroup) continue
    if (oldGroup.length !== 1 || newGroup.length !== 1) {
      onAmbiguous()
      continue
    }
    const oldItem = oldGroup[0]
    const newItem = newGroup[0]
    matchedOld.add(oldItem.index)
    matchedNew.add(newItem.index)
    pairs.push([oldItem, newItem, key])
  }
}

function groupUnmatched(nodes: ComparableNode[], matched: Set<number>, keyOf: (item: ComparableNode) => string | undefined) {
  const groups = new Map<string, ComparableNode[]>()
  for (const item of nodes) {
    if (matched.has(item.index)) continue
    const key = keyOf(item)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}

function comparePair(oldItem: ComparableNode, newItem: ComparableNode, identity: string): SubscriptionDiffEntry {
  const changes: Array<[SubscriptionChangeType, string]> = []
  if (oldItem.node.name !== newItem.node.name) changes.push(['renamed', 'name'])
  if (!equal(authenticationSemantics(oldItem.endpoint), authenticationSemantics(newItem.endpoint))) changes.push(['authentication', authenticationLabel(oldItem.endpoint, newItem.endpoint)])
  if (!equal(connectionSemantics(oldItem.endpoint), connectionSemantics(newItem.endpoint))) changes.push(['connection', connectionLabel(oldItem.endpoint, newItem.endpoint)])
  if (!equal(metadataSemantics(oldItem.endpoint), metadataSemantics(newItem.endpoint))) changes.push(['metadata', 'metadata'])
  if (oldItem.node.status !== newItem.node.status) changes.push(['readiness', 'readiness'])
  const changeTypes = CHANGE_ORDER.filter((type) => changes.some(([candidate]) => candidate === type))
  const changedFields = changes.map(([, field]) => field)
  return changes.length ? {
    kind: 'changed', identity, name: newItem.node.name, previousName: oldItem.node.name, changeTypes, changedFields,
  } : { kind: 'unchanged', identity, name: newItem.node.name, changeTypes: [], changedFields: [] }
}

function authenticationSemantics(endpoint?: ResolvedProxyEndpointIR): unknown {
  if (!endpoint) return null
  switch (endpoint.protocol) {
    case 'http': case 'socks5': return { username: endpoint.username ?? '', password: endpoint.password ?? '', present: Boolean(endpoint.username || endpoint.password) }
    case 'shadowsocks': return { method: endpoint.method, password: endpoint.password }
    case 'trojan': case 'hysteria2': case 'anytls': return { password: endpoint.password }
    case 'vmess': return { uuid: endpoint.uuid, security: endpoint.security }
    case 'vless': return { uuid: endpoint.uuid }
    case 'tuic': return { uuid: endpoint.uuid, password: endpoint.password }
  }
}

function connectionSemantics(endpoint?: ResolvedProxyEndpointIR): unknown {
  if (!endpoint) return null
  const common = { protocol: endpoint.protocol, server: normalizeHost(endpoint.server), port: Number(endpoint.port) }
  switch (endpoint.protocol) {
    case 'http': return { ...common, tls: canonicalTls(endpoint.tls) }
    case 'socks5': return common
    case 'shadowsocks': return { ...common, plugin: endpoint.plugin ?? null }
    case 'trojan': return { ...common, tls: canonicalTls(endpoint.tls), transport: endpoint.transport ?? { kind: 'tcp' } }
    case 'vmess': return { ...common, alterId: endpoint.alterId ?? 0, tls: canonicalTls(endpoint.tls), transport: endpoint.transport ?? { kind: 'tcp' } }
    case 'vless': return { ...common, security: endpoint.security ?? 'none', encryption: endpoint.encryption ?? 'none', flow: endpoint.flow ?? '', tls: canonicalTls(endpoint.tls), transport: endpoint.transport ?? { kind: 'tcp' } }
    case 'hysteria2': return { ...common, tls: canonicalTls(endpoint.tls), obfs: endpoint.obfs ?? null, upMbps: endpoint.upMbps ?? null, downMbps: endpoint.downMbps ?? null, serverPorts: endpoint.serverPorts ?? null, hopInterval: endpoint.hopInterval ?? null }
    case 'tuic': return { ...common, congestionControl: endpoint.congestionControl ?? '', udpRelayMode: endpoint.udpRelayMode ?? '', tls: canonicalTls(endpoint.tls) }
    case 'anytls': return { ...common, tls: canonicalTls(endpoint.tls), udpEnabled: endpoint.udpEnabled ?? true, idleSessionCheckIntervalSeconds: endpoint.idleSessionCheckIntervalSeconds ?? null, idleSessionTimeoutSeconds: endpoint.idleSessionTimeoutSeconds ?? null, minIdleSession: endpoint.minIdleSession ?? null }
  }
}

function connectionAnchor(endpoint: ResolvedProxyEndpointIR) {
  return { protocol: endpoint.protocol, server: normalizeHost(endpoint.server), port: Number(endpoint.port) }
}

function canonicalTls(tls: ProxyTlsIR | undefined) {
  if (!tls) return null
  return { ...tls, serverName: tls.serverName?.toLowerCase(), alpn: tls.alpn ? [...tls.alpn].sort() : undefined }
}

function metadataSemantics(endpoint?: ResolvedProxyEndpointIR) {
  if (!endpoint?.metadata) return null
  const { sourceId: _sourceId, sourceName: _sourceName, ...metadata } = endpoint.metadata
  return metadata
}

function authenticationLabel(oldEndpoint?: ResolvedProxyEndpointIR, newEndpoint?: ResolvedProxyEndpointIR) {
  const protocols = new Set([oldEndpoint?.protocol, newEndpoint?.protocol])
  if ([...protocols].some((protocol) => protocol === 'vmess' || protocol === 'vless' || protocol === 'tuic')) return 'uuid-or-authentication'
  if ([...protocols].some((protocol) => protocol === 'http' || protocol === 'socks5')) return 'username-or-password'
  return 'password'
}

function connectionLabel(oldEndpoint?: ResolvedProxyEndpointIR, newEndpoint?: ResolvedProxyEndpointIR) {
  if (oldEndpoint?.protocol !== newEndpoint?.protocol) return 'protocol'
  if (normalizeHost(oldEndpoint?.server ?? '') !== normalizeHost(newEndpoint?.server ?? '')) return 'server'
  if (oldEndpoint?.port !== newEndpoint?.port) return 'port'
  return 'connection-settings'
}

function normalizeHost(host: string) {
  return host.trim().replace(/^\[|\]$/g, '').toLowerCase()
}

function equal(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

async function opaqueNodeIdentity(item: ComparableNode, sourceId: string) {
  return item.principal ?? item.connectionAnchor ?? sha256(`${sourceId}\u0000unsupported\u0000${item.node.protocol}\u0000${item.index}`)
}

function compareEntries(left: SubscriptionDiffEntry, right: SubscriptionDiffEntry) {
  const order = { added: 0, removed: 1, changed: 2, unchanged: 3 }
  return order[left.kind] - order[right.kind] || left.name.localeCompare(right.name) || left.identity.localeCompare(right.identity)
}

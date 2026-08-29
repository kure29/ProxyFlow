import type { GraphNode, BlockNodeData } from '../../types/project'
import type {
  HealthCheckIR,
  ProxyEndpointIR,
  ProxyTransportIR,
  ProxySetRef,
  ResolvedProxyEndpointIR,
  StrategyCandidateRef,
  StrategyTargetRef,
} from '../ir'
import { detectRegion } from '../proxy'
import { normalizePersistedSubscriptionExportMode, normalizeSubscriptionRequestProfile } from '../subscription'
import type { SubscriptionSnapshot, SubscriptionInputKind, SubscriptionRequestProfile, SubscriptionExportMode } from '../subscription'

/**
 * Runtime-only, target-neutral source intent derived from persisted editor data.
 *
 * This is deliberately not persisted.  The legacy BlockNodeData shape remains
 * the source of truth for UI and Project storage.
 */
export type NormalizedSourceIntent =
  | NormalizedSubscriptionSourceIntent
  | NormalizedManualProxySourceIntent
  | NormalizedProviderSourceIntent
  | NormalizedImportedConfigSourceIntent

interface NormalizedSourceBase {
  id: string
  name: string
  enabled: boolean
  disabled: boolean
}

export interface NormalizedSubscriptionSourceIntent extends NormalizedSourceBase {
  kind: 'subscription'
  inputKind: SubscriptionInputKind
  url?: string
  requestProfile: SubscriptionRequestProfile
  exportMode: SubscriptionExportMode
  proxies?: ResolvedProxyEndpointIR[]
  snapshot?: {
    id: string
    contentHash: string
    fetchedAt: string
  }
  materializationStatus: 'ready' | 'unavailable'
}

export interface NormalizedManualProxySourceIntent extends NormalizedSourceBase {
  kind: 'manual-proxy'
  endpoint: ProxyEndpointIR
}

export interface NormalizedProviderSourceIntent extends NormalizedSourceBase {
  kind: 'provider'
  reference?: string
}

export interface NormalizedImportedConfigSourceIntent extends NormalizedSourceBase {
  kind: 'imported-config'
}

/**
 * Runtime-only, target-neutral strategy intent derived from persisted editor
 * data.  Candidate/source references are supplied by the graph compiler because
 * they come from graph topology rather than editor fields.
 */
export type NormalizedStrategyIntent =
  | NormalizedFixedStrategyIntent
  | NormalizedSelectStrategyIntent
  | NormalizedAutoSelectStrategyIntent
  | NormalizedFallbackStrategyIntent
  | NormalizedLoadBalanceStrategyIntent
  | NormalizedChainStrategyIntent

interface NormalizedStrategyBase {
  id: string
  name: string
  disabled: boolean
}

export interface NormalizedFixedStrategyIntent extends NormalizedStrategyBase {
  kind: 'fixed'
  proxyId?: string
}

export interface NormalizedSelectStrategyIntent extends NormalizedStrategyBase {
  kind: 'select'
  candidates: StrategyCandidateRef[]
}

export interface NormalizedAutoSelectStrategyIntent extends NormalizedStrategyBase {
  kind: 'auto-select'
  source?: ProxySetRef
  healthCheck?: HealthCheckIR
}

export interface NormalizedFallbackStrategyIntent extends NormalizedStrategyBase {
  kind: 'fallback'
  candidates: StrategyCandidateRef[]
  healthCheck?: HealthCheckIR
}

export interface NormalizedLoadBalanceStrategyIntent extends NormalizedStrategyBase {
  kind: 'load-balance'
  source?: ProxySetRef
  mode?: 'round-robin' | 'consistent-hash'
}

export interface NormalizedChainStrategyIntent extends NormalizedStrategyBase {
  kind: 'chain'
  hops: StrategyTargetRef[]
}

export interface StrategyReferenceInputs {
  candidates?: readonly StrategyCandidateRef[]
  source?: ProxySetRef
}

const SOURCE_BLOCK_TYPES = new Set<BlockNodeData['blockType']>(['subscription', 'manual-proxy', 'provider', 'import-config'])
const STRATEGY_BLOCK_TYPES = new Set<BlockNodeData['blockType']>(['fixed-proxy', 'manual-select', 'auto-select', 'fallback', 'load-balance', 'proxy-chain'])

/** Normalize a source node, returning undefined for non-source blocks. */
export function normalizeSourceNode(node: GraphNode, snapshot?: SubscriptionSnapshot): NormalizedSourceIntent | undefined {
  const { blockType } = node.data
  if (!SOURCE_BLOCK_TYPES.has(blockType)) return undefined

  const base = {
    id: node.id,
    name: node.data.title,
    enabled: node.data.enabled ?? true,
    disabled: Boolean(node.data.disabled),
  }

  switch (blockType) {
    case 'subscription': {
      const inputKind = node.data.subscriptionInputKind ?? 'url'
      const url = node.data.subscriptionUrl?.trim()
      return {
        ...base,
        kind: 'subscription',
        inputKind,
        url: url || undefined,
        requestProfile: normalizeSubscriptionRequestProfile(node.data.subscriptionRequestProfile),
        exportMode: normalizePersistedSubscriptionExportMode(node.data.subscriptionExportMode),
        ...(snapshot?.result ? { proxies: snapshot.result.proxies } : {}),
        ...(snapshot ? {
          snapshot: {
            id: snapshot.snapshotId,
            contentHash: snapshot.contentHash,
            fetchedAt: snapshot.fetchedAt,
          },
        } : {}),
        materializationStatus: snapshot ? 'ready' : 'unavailable',
      }
    }
    case 'manual-proxy':
      return { ...base, kind: 'manual-proxy', endpoint: normalizeManualProxy(node.id, node.data.title, node.data) }
    case 'provider':
      return { ...base, kind: 'provider', reference: node.data.subscriptionUrl || undefined }
    case 'import-config':
      return { ...base, kind: 'imported-config' }
    default:
      return undefined
  }
}

/** Normalize a portable strategy node, returning undefined for other blocks. */
export function normalizeStrategyNode(node: GraphNode, references: StrategyReferenceInputs = {}): NormalizedStrategyIntent | undefined {
  const { blockType } = node.data
  if (!STRATEGY_BLOCK_TYPES.has(blockType)) return undefined

  const base = {
    id: node.id,
    name: node.data.title,
    disabled: Boolean(node.data.disabled),
  }

  switch (blockType) {
    case 'fixed-proxy':
      return { ...base, kind: 'fixed', proxyId: node.data.proxyId }
    case 'manual-select':
      return { ...base, kind: 'select', candidates: [...(references.candidates ?? [])] }
    case 'auto-select':
      return { ...base, kind: 'auto-select', source: references.source, healthCheck: normalizeHealthCheck(node.data) }
    case 'fallback':
      return { ...base, kind: 'fallback', candidates: [...(references.candidates ?? [])], healthCheck: normalizeHealthCheck(node.data) }
    case 'load-balance':
      return { ...base, kind: 'load-balance', source: references.source, mode: node.data.loadBalanceMode }
    case 'proxy-chain':
      return {
        ...base,
        kind: 'chain',
        hops: (node.data.hopIds ?? []).map((id) => ({ kind: 'strategy', id })),
      }
    default:
      return undefined
  }
}

function normalizeHealthCheck(data: BlockNodeData): HealthCheckIR | undefined {
  const healthCheck: HealthCheckIR = {
    url: data.testUrl,
    intervalSeconds: data.interval,
    toleranceMs: data.tolerance,
  }
  return Object.values(healthCheck).some((value) => value !== undefined) ? healthCheck : undefined
}

function normalizeManualProxy(id: string, name: string, data: BlockNodeData): ProxyEndpointIR {
  const server = data.proxyServer?.trim()
  const port = data.proxyPort
  if (!data.proxyProtocol || !server || !Number.isInteger(port) || port! < 1 || port! > 65_535) {
    return { kind: 'unmodeled', protocol: 'unmodeled', id, name }
  }

  const metadata = { sourceId: id, sourceName: name, region: detectRegion(name) }
  const credentials = {
    ...(data.proxyUsername ? { username: data.proxyUsername } : {}),
    ...(data.proxyPassword ? { password: data.proxyPassword } : {}),
  }
  const tls = data.proxyTls
    ? { enabled: true, ...(data.proxyServerName ? { serverName: data.proxyServerName } : {}), ...(data.proxyAllowInsecure ? { allowInsecure: true } : {}) }
    : undefined
  const transport = normalizeTransport(data)

  switch (data.proxyProtocol) {
    case 'socks':
    case 'socks5':
      return { kind: 'socks', protocol: 'socks5', id, name, server, port: port!, version: '5', metadata, ...credentials }
    case 'http':
      return { kind: 'http', protocol: 'http', id, name, server, port: port!, metadata, ...credentials, ...(tls ? { tls } : {}) }
    case 'shadowsocks':
      return data.proxyMethod && data.proxyPassword
        ? { kind: 'shadowsocks', protocol: 'shadowsocks', id, name, server, port: port!, method: data.proxyMethod, password: data.proxyPassword, metadata }
        : { kind: 'unmodeled', protocol: 'unmodeled', id, name }
    case 'trojan':
      return data.proxyPassword
        ? { kind: 'trojan', protocol: 'trojan', id, name, server, port: port!, password: data.proxyPassword, tls: tls ?? { enabled: true, serverName: data.proxyServerName ?? server }, metadata, ...(transport ? { transport } : {}) }
        : { kind: 'unmodeled', protocol: 'unmodeled', id, name }
    case 'vmess':
      return data.proxyUuid
        ? { kind: 'vmess', protocol: 'vmess', id, name, server, port: port!, uuid: data.proxyUuid, security: data.proxySecurity ?? 'auto', ...(data.proxyAlterId !== undefined ? { alterId: data.proxyAlterId } : {}), metadata, ...(tls ? { tls } : {}), ...(transport ? { transport } : {}) }
        : { kind: 'unmodeled', protocol: 'unmodeled', id, name }
    case 'vless':
      return data.proxyUuid
        ? { kind: 'vless', protocol: 'vless', id, name, server, port: port!, uuid: data.proxyUuid, metadata, ...(tls ? { tls } : {}), ...(transport ? { transport } : {}) }
        : { kind: 'unmodeled', protocol: 'unmodeled', id, name }
    case 'anytls':
      return data.proxyPassword
        ? {
            kind: 'anytls', protocol: 'anytls', id, name, server, port: port!, password: data.proxyPassword, metadata,
            tls: {
              enabled: true, serverName: data.proxyServerName ?? server,
              ...(data.proxyAllowInsecure ? { allowInsecure: true } : {}),
              ...(data.proxyClientFingerprint?.trim() ? { fingerprint: data.proxyClientFingerprint.trim().toLocaleLowerCase() } : {}),
            },
            ...(data.proxyIdleSessionCheckInterval !== undefined ? { idleSessionCheckIntervalSeconds: data.proxyIdleSessionCheckInterval } : {}),
            ...(data.proxyIdleSessionTimeout !== undefined ? { idleSessionTimeoutSeconds: data.proxyIdleSessionTimeout } : {}),
            ...(data.proxyMinIdleSession !== undefined ? { minIdleSession: data.proxyMinIdleSession } : {}),
          }
        : { kind: 'unmodeled', protocol: 'unmodeled', id, name }
    default:
      return { kind: 'unmodeled', protocol: 'unmodeled', id, name }
  }
}

function normalizeTransport(data: BlockNodeData): ProxyTransportIR | undefined {
  switch (data.proxyTransport) {
    case 'ws': return { kind: 'ws', ...(data.proxyTransportPath ? { path: data.proxyTransportPath } : {}), ...(data.proxyTransportHost ? { host: data.proxyTransportHost } : {}) }
    case 'http': return { kind: 'http', variant: 'http', ...(data.proxyTransportPath ? { path: data.proxyTransportPath } : {}), ...(data.proxyTransportHost ? { host: data.proxyTransportHost } : {}) }
    case 'grpc': return { kind: 'grpc', ...(data.proxyGrpcServiceName ? { serviceName: data.proxyGrpcServiceName } : {}) }
    case 'tcp': return { kind: 'tcp' }
    default: return undefined
  }
}

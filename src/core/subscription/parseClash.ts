import { parseDocument } from 'yaml'
import { detectRegion, isPortableShadowsocksPlugin, isSupportedShadowsocksMethod, makeProxyId, stableOpaqueHash, type ProxyCompatibilityHint, type ProxyTlsIR, type ProxyTransportIR, type ResolvedProxyEndpointIR } from '../proxy'
import { subscriptionIssue } from './errors'
import type { ParseSubscriptionOptions, ParsedSubscriptionNode, ProxyEndpointDraft, SubscriptionIssue } from './types'
import { booleanValue, isValidUuid, stringValue, validPort } from './utils'

interface ClashParseResult {
  nodes: ParsedSubscriptionNode[]
  issues: SubscriptionIssue[]
  hasNonProxySections: boolean
}

export function parseClashSubscription(input: string, options: Required<Pick<ParseSubscriptionOptions, 'sourceId'>> & ParseSubscriptionOptions): ClashParseResult | undefined {
  const document = parseDocument(input, { schema: 'core' })
  if (document.errors.length) return undefined
  let value: unknown
  try { value = document.toJS({ maxAliasCount: 32 }) } catch { return undefined }
  if (!isRecord(value) || !Array.isArray(value.proxies)) return undefined
  const sourceName = options.sourceName ?? 'Subscription'
  const issues: SubscriptionIssue[] = []
  const nodes = value.proxies.map((raw, index) => parseClashNode(raw, options.sourceId, sourceName, index + 1, issues))
  return {
    nodes,
    issues,
    hasNonProxySections: Object.keys(value).some((key) => key !== 'proxies'),
  }
}

function parseClashNode(raw: unknown, sourceId: string, sourceName: string, index: number, allIssues: SubscriptionIssue[]): ParsedSubscriptionNode {
  const record = isRecord(raw) ? raw : {}
  const type = stringValue(record.type)?.toLocaleLowerCase() ?? 'unknown'
  const name = stringValue(record.name) ?? `Node ${index}`
  const server = stringValue(record.server)
  const port = validPort(record.port)
  const nodeIssues: SubscriptionIssue[] = []
  const fail = (code: string, message: string) => {
    const issue = subscriptionIssue(code, 'error', message, { nodeName: name })
    allIssues.push(issue)
    return {
      id: `unsupported-${stableOpaqueHash(`${sourceId}\u0000${type}\u0000${name}\u0000${index}`)}`,
      name, protocol: type, sourceId, sourceName, status: 'unsupported' as const, issues: [issue],
    }
  }
  if (!server || !port) return fail('PROXY_NODE_INVALID', `${name} 缺少有效的 server 或 port。`)

  let draft: ProxyEndpointDraft | undefined
  let compatibility: ProxyCompatibilityHint | undefined
  switch (type) {
    case 'http':
      draft = {
        kind: 'http', protocol: 'http', name, server, port,
        ...(stringValue(record.username) ? { username: stringValue(record.username) } : {}),
        ...(stringValue(record.password) ? { password: stringValue(record.password) } : {}),
        ...(booleanValue(record.tls) ? { tls: tlsFromClash(record, server) } : {}),
      }
      break
    case 'socks':
    case 'socks5':
      draft = {
        kind: 'socks', protocol: 'socks5', version: '5', name, server, port,
        ...(stringValue(record.username) ? { username: stringValue(record.username) } : {}),
        ...(stringValue(record.password) ? { password: stringValue(record.password) } : {}),
      }
      break
    case 'ss': {
      const method = stringValue(record.cipher)
      const password = stringValue(record.password)
      if (!method || !password) return fail('PROXY_NODE_INVALID', `${name} 缺少 Shadowsocks cipher 或 password。`)
      if (!isSupportedShadowsocksMethod(method)) return fail('PROXY_CIPHER_UNSUPPORTED', `${name} 使用了 Mihomo 与 sing-box 共同子集不支持的 Shadowsocks cipher “${method}”。`)
      const plugin = stringValue(record.plugin)
      if (plugin && !isPortableShadowsocksPlugin(plugin)) compatibility = compatibilityFor([`plugin:${plugin}`], nodeIssues, name)
      draft = {
        kind: 'shadowsocks', protocol: 'shadowsocks', name, server, port, method, password,
        ...(plugin ? { plugin: { name: plugin, ...(isRecord(record['plugin-opts']) ? { options: primitiveRecord(record['plugin-opts']) } : {}) } } : {}),
      }
      break
    }
    case 'trojan': {
      const password = stringValue(record.password)
      if (!password) return fail('PROXY_NODE_INVALID', `${name} 缺少 Trojan password。`)
      const partial = partialClashFeatures(record, ['reality-opts', 'shadow-tls-opts', 'restls-opts', 'jls-opts', 'ss-opts'])
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = { kind: 'trojan', protocol: 'trojan', name, server, port, password, tls: tlsFromClash(record, server), ...(transportFromClash(record) ? { transport: transportFromClash(record) } : {}) }
      break
    }
    case 'vmess': {
      const uuid = stringValue(record.uuid)
      if (!uuid || !isValidUuid(uuid)) return fail('PROXY_NODE_INVALID', `${name} 缺少有效的 VMess UUID。`)
      const partial = partialClashFeatures(record, ['reality-opts'])
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = {
        kind: 'vmess', protocol: 'vmess', name, server, port, uuid,
        security: stringValue(record.cipher) ?? 'auto',
        ...(Number.isInteger(Number(record.alterId)) ? { alterId: Number(record.alterId) } : {}),
        ...(booleanValue(record.tls) ? { tls: tlsFromClash(record, server) } : {}),
        ...(transportFromClash(record) ? { transport: transportFromClash(record) } : {}),
      }
      break
    }
    case 'vless': {
      const uuid = stringValue(record.uuid)
      if (!uuid || !isValidUuid(uuid)) return fail('PROXY_NODE_INVALID', `${name} 缺少有效的 VLESS UUID。`)
      const partial = partialClashFeatures(record, ['reality-opts', 'flow', 'encryption'])
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = {
        kind: 'vless', protocol: 'vless', name, server, port, uuid,
        ...(booleanValue(record.tls) || record['reality-opts'] ? { tls: tlsFromClash(record, server) } : {}),
        ...(transportFromClash(record) ? { transport: transportFromClash(record) } : {}),
      }
      break
    }
    default:
      return fail('PROXY_PROTOCOL_UNSUPPORTED', `${name} 使用了 V0.5 不支持的协议 “${type}”。`)
  }

  const endpoint = {
    ...draft,
    id: makeProxyId(sourceId, draft),
    metadata: { sourceId, sourceName, region: detectRegion(name), ...(compatibility ? { compatibility } : {}) },
  } as ResolvedProxyEndpointIR
  allIssues.push(...nodeIssues)
  return {
    id: endpoint.id, name, protocol: endpoint.protocol, server, port, sourceId, sourceName,
    status: compatibility ? 'partial' : 'ready', endpoint, issues: nodeIssues,
  }
}

function tlsFromClash(record: Record<string, unknown>, server: string): ProxyTlsIR {
  const alpn = Array.isArray(record.alpn) ? record.alpn.filter((item): item is string => typeof item === 'string') : undefined
  return {
    enabled: true,
    serverName: stringValue(record.sni) ?? stringValue(record.servername) ?? server,
    ...(booleanValue(record['skip-cert-verify']) ? { allowInsecure: true } : {}),
    ...(alpn?.length ? { alpn } : {}),
  }
}

function transportFromClash(record: Record<string, unknown>): ProxyTransportIR | undefined {
  const network = stringValue(record.network) ?? 'tcp'
  if (network === 'tcp') return { kind: 'tcp' }
  if (network === 'ws') {
    const options = isRecord(record['ws-opts']) ? record['ws-opts'] : {}
    const headers = isRecord(options.headers) ? options.headers : {}
    return { kind: 'ws', ...(stringValue(options.path) ? { path: stringValue(options.path) } : {}), ...(stringValue(headers.Host) ? { host: stringValue(headers.Host) } : {}) }
  }
  if (network === 'http' || network === 'h2') {
    const options = isRecord(record['http-opts']) ? record['http-opts'] : {}
    const paths = Array.isArray(options.path) ? options.path : []
    const headers = isRecord(options.headers) ? options.headers : {}
    const hosts = Array.isArray(headers.Host) ? headers.Host : []
    return { kind: 'http', ...(stringValue(paths[0]) ? { path: stringValue(paths[0]) } : {}), ...(stringValue(hosts[0]) ? { host: stringValue(hosts[0]) } : {}) }
  }
  if (network === 'grpc') {
    const options = isRecord(record['grpc-opts']) ? record['grpc-opts'] : {}
    return { kind: 'grpc', ...(stringValue(options['grpc-service-name']) ? { serviceName: stringValue(options['grpc-service-name']) } : {}) }
  }
  return undefined
}

function compatibilityFor(features: string[], issues: SubscriptionIssue[], name: string): ProxyCompatibilityHint | undefined {
  if (!features.length) return undefined
  issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `${name} 包含当前不可靠支持的特性：${features.join(', ')}。`, { nodeName: name }))
  return { status: 'partial', unsupportedFeatures: features }
}

function partialClashFeatures(record: Record<string, unknown>, keys: string[]) {
  return keys.filter((key) => record[key] !== undefined && record[key] !== '' && record[key] !== false)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function primitiveRecord(value: unknown): Record<string, string | number | boolean> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1])))
}

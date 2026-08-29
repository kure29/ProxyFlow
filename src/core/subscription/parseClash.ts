import { parseDocument } from 'yaml'
import { cloneJsonObject, cloneJsonValue, detectRegion, isModeledShadowsocksMethod, isPortableShadowsocksPlugin, makeProxyId, stableOpaqueHash, type Hysteria2HopIntervalIR, type Hysteria2PortIR, type OpaqueProxyOrigin, type ProxyCompatibilityHint, type ProxyTlsIR, type ProxyTransportIR, type ResolvedProxyEndpointIR } from '../proxy'
import { subscriptionIssue } from './errors'
import type { ParseSubscriptionOptions, ParsedSubscriptionNode, ProxyEndpointDraft, SubscriptionIssue } from './types'
import { booleanValue, isValidUuid, mergeEndpointSemanticCompatibility, stringValue, validPort } from './utils'

export interface ClashParseResult {
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
  return parseClashRecords(value.proxies, options, Object.keys(value).some((key) => key !== 'proxies'), {
    kind: 'target', target: 'mihomo', format: 'clash-yaml',
  })
}

export function parseClashRecords(
  records: unknown[],
  options: Required<Pick<ParseSubscriptionOptions, 'sourceId'>> & ParseSubscriptionOptions,
  hasNonProxySections = false,
  opaqueOrigin?: OpaqueProxyOrigin,
): ClashParseResult {
  const sourceName = options.sourceName ?? 'Subscription'
  const issues: SubscriptionIssue[] = []
  const nodes = records.map((raw, index) => parseClashNode(raw, options.sourceId, sourceName, index + 1, issues, opaqueOrigin))
  return {
    nodes,
    issues,
    hasNonProxySections,
  }
}

function parseClashNode(raw: unknown, sourceId: string, sourceName: string, index: number, allIssues: SubscriptionIssue[], opaqueOrigin?: OpaqueProxyOrigin): ParsedSubscriptionNode {
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
      {
      const tlsEnabled = booleanValue(record.tls) === true
      compatibility = compatibilityFor(tlsCriticalFeatures(record, false, tlsEnabled), nodeIssues, name)
      draft = {
        kind: 'http', protocol: 'http', name, server, port,
        ...(stringValue(record.username) ? { username: stringValue(record.username) } : {}),
        ...(stringValue(record.password) ? { password: stringValue(record.password) } : {}),
        ...(tlsEnabled || hasTlsOnlyIntent(record) ? { tls: tlsFromClash(record, server, tlsEnabled) } : {}),
      }
      break
      }
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
      if (!isModeledShadowsocksMethod(method)) return fail('PROXY_CIPHER_UNSUPPORTED', `${name} 使用了 Universal IR 尚未建模的 Shadowsocks cipher “${method}”。`)
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
      const transport = transportFromClash(record)
      const tlsEnabled = booleanValue(record.tls) ?? true
      const partial = [...tlsCriticalFeatures(record, false, tlsEnabled), ...partialClashFeatures(record, ['reality-opts', 'shadow-tls-opts', 'restls-opts', 'jls-opts', 'ss-opts']), ...(transport.unsupported ? [transport.unsupported] : []), ...(transport.transport?.kind === 'xhttp' ? ['xhttp:requires-vless'] : [])]
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = { kind: 'trojan', protocol: 'trojan', name, server, port, password, tls: tlsFromClash(record, server, tlsEnabled), ...(transport.transport ? { transport: transport.transport } : {}) }
      break
    }
    case 'vmess': {
      const uuid = stringValue(record.uuid)
      if (!uuid || !isValidUuid(uuid)) return fail('PROXY_NODE_INVALID', `${name} 缺少有效的 VMess UUID。`)
      const transport = transportFromClash(record)
      const tlsEnabled = booleanValue(record.tls) === true
      const alterIdValue = record.alterId ?? record['alter-id']
      const alterId = nonNegativeInteger(alterIdValue)
      const partial = [
        ...tlsCriticalFeatures(record, false, tlsEnabled),
        ...partialClashFeatures(record, ['reality-opts']),
        ...(alterIdValue !== undefined && alterId === undefined ? ['alter-id:invalid'] : []),
        ...(transport.unsupported ? [transport.unsupported] : []),
        ...(transport.transport?.kind === 'xhttp' ? ['xhttp:requires-vless'] : []),
      ]
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = {
        kind: 'vmess', protocol: 'vmess', name, server, port, uuid,
        security: stringValue(record.cipher) ?? 'auto',
        ...(alterId !== undefined ? { alterId } : {}),
        ...(tlsEnabled || hasTlsOnlyIntent(record) ? { tls: tlsFromClash(record, server, tlsEnabled) } : {}),
        ...(transport.transport ? { transport: transport.transport } : {}),
      }
      break
    }
    case 'vless': {
      const uuid = stringValue(record.uuid)
      if (!uuid || !isValidUuid(uuid)) return fail('PROXY_NODE_INVALID', `${name} 缺少有效的 VLESS UUID。`)
      const transport = transportFromClash(record)
      const flow = stringValue(record.flow)
      const security = stringValue(record.security)?.toLocaleLowerCase()
      const realityOptions = isRecord(record['reality-opts']) ? record['reality-opts'] : undefined
      const publicKey = realityOptions ? stringValue(realityOptions['public-key']) : undefined
      const shortId = realityOptions ? stringValue(realityOptions['short-id']) : undefined
      const realityRequested = security === 'reality' || Boolean(realityOptions)
      const tlsFlag = booleanValue(record.tls)
      const normalizedSecurity = ['none', 'tls', 'reality'].includes(security ?? '')
        ? security as 'none' | 'tls' | 'reality'
        : security ? undefined : realityRequested ? 'reality' : tlsFlag === true ? 'tls' : 'none'
      const tlsEnabled = normalizedSecurity === 'none'
        ? tlsFlag === true
        : normalizedSecurity === 'tls' || normalizedSecurity === 'reality'
          ? tlsFlag !== false
          : tlsFlag === true
      const encryption = stringValue(record.encryption)?.toLocaleLowerCase()
      const partial = [
        ...tlsCriticalFeatures(record, false, tlsEnabled),
        ...(security && !['none', 'tls', 'reality'].includes(security) ? [`security:${security}`] : []),
        ...(security === 'none' && realityRequested ? ['reality:security-none'] : []),
        ...(security === 'tls' && realityRequested ? ['reality:security-tls'] : []),
        ...(security === 'none' && tlsFlag === true || ['tls', 'reality'].includes(security ?? '') && tlsFlag === false ? ['tls:conflicting-security-flags'] : []),
        ...(encryption && encryption !== 'none' ? [`encryption:${encryption}`] : []),
        ...(flow && flow !== 'none' && flow !== 'xtls-rprx-vision' ? [`flow:${flow}`] : []),
        ...(realityRequested && !publicKey ? ['reality:missing-public-key'] : []),
        ...(publicKey && !/^[A-Za-z0-9_-]{43}$/.test(publicKey) ? ['reality:invalid-public-key'] : []),
        ...(realityRequested && !(stringValue(record.sni) ?? stringValue(record.servername)) ? ['reality:missing-server-name'] : []),
        ...(shortId && (!/^[0-9a-f]+$/i.test(shortId) || shortId.length > 16 || shortId.length % 2 !== 0) ? ['reality:invalid-short-id'] : []),
        ...(transport.unsupported ? [transport.unsupported] : []),
      ]
      compatibility = compatibilityFor(partial, nodeIssues, name)
      const tls = tlsEnabled || realityRequested || hasTlsOnlyIntent(record) ? tlsFromClash(record, server, tlsEnabled) : undefined
      if (tls && realityRequested && publicKey) tls.reality = { publicKey, ...(shortId ? { shortId } : {}) }
      draft = {
        kind: 'vless', protocol: 'vless', name, server, port, uuid,
        ...(normalizedSecurity ? { security: normalizedSecurity } : {}),
        ...(encryption === 'none' ? { encryption: 'none' as const } : {}),
        ...(flow === 'xtls-rprx-vision' ? { flow } : {}),
        ...(tls ? { tls } : {}),
        ...(transport.transport ? { transport: transport.transport } : {}),
      }
      break
    }
    case 'hysteria2':
    case 'hy2': {
      const password = stringValue(record.password)
      if (!password) return fail('PROXY_NODE_INVALID', `${name} 缺少 Hysteria2 password。`)
      const obfsType = stringValue(record.obfs)?.toLocaleLowerCase()
      const obfsPassword = stringValue(record['obfs-password'])
      const serverPorts = parseClashServerPorts(record.ports)
      const hopInterval = parseClashHopInterval(record['hop-interval'])
      const tlsEnabled = booleanValue(record.tls) ?? true
      const upMbps = positiveNumber(record.up)
      const downMbps = positiveNumber(record.down)
      const partial = [
        ...tlsCriticalFeatures(record, false, tlsEnabled),
        ...(obfsType && obfsType !== 'salamander' ? [`obfs:${obfsType}`] : []),
        ...(obfsType === 'salamander' && !obfsPassword ? ['obfs:missing-password'] : []),
        ...(record.ports !== undefined && !serverPorts ? ['port-hopping:invalid-range'] : []),
        ...(record['hop-interval'] !== undefined && hopInterval === undefined ? ['port-hopping:invalid-interval'] : []),
        ...(record.up !== undefined && upMbps === undefined ? ['bandwidth:invalid-up'] : []),
        ...(record.down !== undefined && downMbps === undefined ? ['bandwidth:invalid-down'] : []),
      ]
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = {
        kind: 'hysteria2', protocol: 'hysteria2', name, server, port, password, tls: tlsFromClash(record, server, tlsEnabled),
        ...(obfsType === 'salamander' && obfsPassword ? { obfs: { type: 'salamander', password: obfsPassword } } : {}),
        ...(upMbps !== undefined ? { upMbps } : {}),
        ...(downMbps !== undefined ? { downMbps } : {}),
        ...(serverPorts ? { serverPorts } : {}),
        ...(hopInterval ? { hopInterval } : {}),
      }
      break
    }
    case 'tuic': {
      const uuid = stringValue(record.uuid)
      const password = stringValue(record.password)
      if (!uuid || !isValidUuid(uuid) || !password) return fail('PROXY_NODE_INVALID', `${name} 缺少有效的 TUIC v5 UUID 或 password。`)
      const congestionControl = stringValue(record['congestion-controller'])?.toLocaleLowerCase()
      const udpRelayMode = stringValue(record['udp-relay-mode'])?.toLocaleLowerCase()
      const tlsEnabled = booleanValue(record.tls) ?? true
      const partial = [
        ...tlsCriticalFeatures(record, true, tlsEnabled),
        ...(congestionControl && !['cubic', 'new_reno', 'bbr'].includes(congestionControl) ? [`congestion-control:${congestionControl}`] : []),
        ...(udpRelayMode && !['native', 'quic'].includes(udpRelayMode) ? [`udp-relay-mode:${udpRelayMode}`] : []),
      ]
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = {
        kind: 'tuic', protocol: 'tuic', name, server, port, uuid, password, tls: tlsFromClash(record, server, tlsEnabled),
        ...(['cubic', 'new_reno', 'bbr'].includes(congestionControl ?? '') ? { congestionControl: congestionControl as 'cubic' | 'new_reno' | 'bbr' } : {}),
        ...(['native', 'quic'].includes(udpRelayMode ?? '') ? { udpRelayMode: udpRelayMode as 'native' | 'quic' } : {}),
      }
      break
    }
    case 'anytls': {
      const password = stringValue(record.password)
      if (!password) return fail('PROXY_NODE_INVALID', `${name} 缺少 AnyTLS password。`)
      const tlsEnabled = booleanValue(record.tls) ?? true
      const udpEnabled = record.udp === undefined ? true : booleanValue(record.udp)
      const idleSessionCheckIntervalSeconds = positiveInteger(record['idle-session-check-interval'])
      const idleSessionTimeoutSeconds = positiveInteger(record['idle-session-timeout'])
      const minIdleSession = nonNegativeInteger(record['min-idle-session'])
      const partial = [
        ...tlsCriticalFeatures(record, false, tlsEnabled),
        ...partialClashFeatures(record, ['reality-opts', 'shadow-tls-opts', 'restls-opts', 'jls-opts', 'client-metadata']),
        ...(record.security !== undefined ? [`security:${String(record.security)}`] : []),
        ...(record.flow !== undefined ? [`flow:${String(record.flow)}`] : []),
        ...(record.udp !== undefined && udpEnabled === undefined ? ['anytls:invalid-udp'] : []),
        ...(record['idle-session-check-interval'] !== undefined && idleSessionCheckIntervalSeconds === undefined ? ['anytls:invalid-idle-session-check-interval'] : []),
        ...(record['idle-session-timeout'] !== undefined && idleSessionTimeoutSeconds === undefined ? ['anytls:invalid-idle-session-timeout'] : []),
        ...(record['min-idle-session'] !== undefined && minIdleSession === undefined ? ['anytls:invalid-min-idle-session'] : []),
      ]
      if (partial.some((feature) => feature.startsWith('anytls:invalid-') && feature !== 'anytls:invalid-udp')) nodeIssues.push(subscriptionIssue(
        'PROXY_ANYTLS_IDLE_SESSION_INVALID', 'warning', `${name} 包含非法 AnyTLS session 参数。`, { nodeName: name },
      ))
      if (partial.includes('anytls:invalid-udp')) nodeIssues.push(subscriptionIssue(
        'PROXY_ANYTLS_UDP_INVALID', 'warning', `${name} 包含非法 AnyTLS UDP 参数。`, { nodeName: name },
      ))
      compatibility = compatibilityFor(partial, nodeIssues, name)
      draft = {
        kind: 'anytls', protocol: 'anytls', name, server, port, password, tls: tlsFromClash(record, server, tlsEnabled),
        ...(udpEnabled !== undefined ? { udpEnabled } : {}),
        ...(idleSessionCheckIntervalSeconds !== undefined ? { idleSessionCheckIntervalSeconds } : {}),
        ...(idleSessionTimeoutSeconds !== undefined ? { idleSessionTimeoutSeconds } : {}),
        ...(minIdleSession !== undefined ? { minIdleSession } : {}),
      }
      break
    }
    default:
      return fail('PROXY_PROTOCOL_UNSUPPORTED', `${name} 使用了当前版本不支持的协议 “${type}”。`)
  }

  const endpointWithoutCompatibility = {
    ...draft,
    id: makeProxyId(sourceId, draft),
    metadata: { sourceId, sourceName, region: detectRegion(name) },
    ...(opaqueOrigin ? opaqueClashPreservation(record, type, opaqueOrigin) : {}),
  } as ResolvedProxyEndpointIR
  const mergedCompatibility = mergeEndpointSemanticCompatibility(endpointWithoutCompatibility, compatibility, nodeIssues, { nodeName: name })
  const endpoint = {
    ...endpointWithoutCompatibility,
    metadata: { ...endpointWithoutCompatibility.metadata, ...(mergedCompatibility ? { compatibility: mergedCompatibility } : {}) },
  } as ResolvedProxyEndpointIR
  allIssues.push(...nodeIssues)
  return {
    id: endpoint.id, name, protocol: endpoint.protocol, server, port, sourceId, sourceName,
    status: mergedCompatibility?.status === 'partial' ? 'partial' : 'ready', endpoint, issues: nodeIssues,
  }
}

function tlsFromClash(record: Record<string, unknown>, server: string, enabled: boolean): ProxyTlsIR {
  const alpn = Array.isArray(record.alpn) ? record.alpn.filter((item): item is string => typeof item === 'string') : undefined
  return {
    enabled,
    serverName: stringValue(record.sni) ?? stringValue(record.servername) ?? server,
    ...(booleanValue(record['skip-cert-verify']) ? { allowInsecure: true } : {}),
    ...(booleanValue(record['disable-sni']) || booleanValue(record.disable_sni) ? { disableSni: true } : {}),
    ...(alpn?.length ? { alpn } : {}),
    ...(stringValue(record['client-fingerprint']) ? { fingerprint: stringValue(record['client-fingerprint']) } : {}),
  }
}

function transportFromClash(record: Record<string, unknown>): { transport?: ProxyTransportIR; unsupported?: string } {
  const network = stringValue(record.network) ?? 'tcp'
  if (network === 'tcp') return { transport: { kind: 'tcp' } }
  if (network === 'ws') {
    const options = isRecord(record['ws-opts']) ? record['ws-opts'] : {}
    const headers = isRecord(options.headers) ? options.headers : {}
    const earlyDataValue = options['max-early-data']
    const maxEarlyData = nonNegativeInteger(earlyDataValue)
    const upgradeValue = options['v2ray-http-upgrade']
    const httpUpgrade = booleanValue(upgradeValue)
    const invalid = earlyDataValue !== undefined && maxEarlyData === undefined
      ? 'ws-early-data:invalid'
      : upgradeValue !== undefined && httpUpgrade === undefined
        ? 'httpupgrade:invalid-upgrade-flag'
        : httpUpgrade && (earlyDataValue !== undefined || options['early-data-header-name'] !== undefined)
          ? 'httpupgrade:ws-early-data-conflict'
          : undefined
    if (httpUpgrade) return { transport: {
      kind: 'httpupgrade', ...(stringValue(options.path) ? { path: stringValue(options.path) } : {}), ...(stringValue(headers.Host) ? { host: stringValue(headers.Host) } : {}),
    }, ...(invalid ? { unsupported: invalid } : {}) }
    return { transport: {
      kind: 'ws', ...(stringValue(options.path) ? { path: stringValue(options.path) } : {}), ...(stringValue(headers.Host) ? { host: stringValue(headers.Host) } : {}),
      ...(maxEarlyData !== undefined ? { maxEarlyData } : {}),
      ...(stringValue(options['early-data-header-name']) ? { earlyDataHeaderName: stringValue(options['early-data-header-name']) } : {}),
    }, ...(invalid ? { unsupported: invalid } : {}) }
  }
  if (network === 'http' || network === 'h2') {
    const options = isRecord(record[network === 'h2' ? 'h2-opts' : 'http-opts']) ? record[network === 'h2' ? 'h2-opts' : 'http-opts'] as Record<string, unknown> : {}
    const paths = Array.isArray(options.path) ? options.path : []
    const headers = isRecord(options.headers) ? options.headers : {}
    const hosts = Array.isArray(headers.Host) ? headers.Host : []
    const h2Hosts = Array.isArray(options.host) ? options.host : []
    return { transport: { kind: 'http', variant: network, ...(stringValue(paths[0]) ?? stringValue(options.path) ? { path: stringValue(paths[0]) ?? stringValue(options.path) } : {}), ...(stringValue(hosts[0]) ?? stringValue(h2Hosts[0]) ? { host: stringValue(hosts[0]) ?? stringValue(h2Hosts[0]) } : {}) } }
  }
  if (network === 'grpc') {
    const options = isRecord(record['grpc-opts']) ? record['grpc-opts'] : {}
    return { transport: { kind: 'grpc', ...(stringValue(options['grpc-service-name']) ? { serviceName: stringValue(options['grpc-service-name']) } : {}) } }
  }
  if (network === 'httpupgrade') {
    const options = isRecord(record['httpupgrade-opts']) ? record['httpupgrade-opts'] : {}
    return { transport: { kind: 'httpupgrade', ...(stringValue(options.path) ? { path: stringValue(options.path) } : {}), ...(stringValue(options.host) ? { host: stringValue(options.host) } : {}) } }
  }
  if (network === 'xhttp') {
    const options = isRecord(record['xhttp-opts']) ? record['xhttp-opts'] : {}
    const mode = stringValue(options.mode)?.toLocaleLowerCase()
    const supportedMode: 'auto' | 'stream-one' | 'stream-up' | 'packet-up' | undefined = mode === 'auto' || mode === 'stream-one' || mode === 'stream-up' || mode === 'packet-up' ? mode : undefined
    return { transport: { kind: 'xhttp', ...(stringValue(options.path) ? { path: stringValue(options.path) } : {}), ...(stringValue(options.host) ? { host: stringValue(options.host) } : {}), ...(supportedMode ? { mode: supportedMode } : {}) }, ...(mode && !supportedMode ? { unsupported: `xhttp-mode:${mode}` } : {}) }
  }
  return { unsupported: `transport:${network}` }
}

function positiveNumber(value: unknown) {
  const match = typeof value === 'string' ? /^([0-9]+(?:\.[0-9]+)?)\s*(?:mbps|m)?$/i.exec(value.trim()) : undefined
  const number = typeof value === 'number' ? value : match ? Number(match[1]) : Number.NaN
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function nonNegativeInteger(value: unknown) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : undefined
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined
  const number = Number(value.trim())
  return Number.isSafeInteger(number) ? number : undefined
}

function positiveInteger(value: unknown) {
  const number = nonNegativeInteger(value)
  return number !== undefined && number > 0 ? number : undefined
}

function parseClashServerPorts(value: unknown): Hysteria2PortIR[] | undefined {
  const values = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []).map(String).map((item) => item.trim()).filter(Boolean)
  const ports = values.map(parseClashServerPort)
  return values.length > 0 && ports.every((item): item is Hysteria2PortIR => Boolean(item)) ? ports : undefined
}

function parseClashServerPort(value: string): Hysteria2PortIR | undefined {
  const single = /^(\d{1,5})$/.exec(value)
  if (single) {
    const port = Number(single[1])
    return port >= 1 && port <= 65_535 ? { kind: 'single', port } : undefined
  }
  const range = /^(\d{1,5})-(\d{1,5})$/.exec(value)
  if (!range) return undefined
  const start = Number(range[1])
  const end = Number(range[2])
  return start >= 1 && end <= 65_535 && start <= end ? { kind: 'range', start, end } : undefined
}

function parseClashHopInterval(value: unknown): Hysteria2HopIntervalIR | undefined {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? { kind: 'fixed', seconds: value } : undefined
  if (typeof value !== 'string') return undefined
  const fixed = /^(\d+)$/.exec(value.trim())
  if (fixed) {
    const seconds = Number(fixed[1])
    return seconds > 0 ? { kind: 'fixed', seconds } : undefined
  }
  const range = /^(\d+)-(\d+)$/.exec(value.trim())
  if (!range) return undefined
  const minSeconds = Number(range[1])
  const maxSeconds = Number(range[2])
  return minSeconds > 0 && minSeconds <= maxSeconds ? { kind: 'range', minSeconds, maxSeconds } : undefined
}

function compatibilityFor(features: string[], issues: SubscriptionIssue[], name: string): ProxyCompatibilityHint | undefined {
  if (!features.length) return undefined
  if (features.includes('ws-early-data:invalid')) issues.push(subscriptionIssue('PROXY_WS_EARLY_DATA_INVALID', 'warning', `${name} 包含非法 WebSocket early-data 值，未静默丢弃。`, { nodeName: name }))
  if (features.some((feature) => feature.startsWith('security:'))) issues.push(subscriptionIssue('PROXY_SECURITY_UNSUPPORTED', 'warning', `${name} 包含未知 security 值，已阻止不安全编译。`, { nodeName: name }))
  if (features.some((feature) => feature.startsWith('flow:'))) issues.push(subscriptionIssue('PROXY_FLOW_UNSUPPORTED', 'warning', `${name} 包含未知 flow，已阻止不安全编译。`, { nodeName: name }))
  if (features.some((feature) => feature.startsWith('tls:'))) issues.push(subscriptionIssue('PROXY_SECURITY_CRITICAL_UNSUPPORTED', 'warning', `${name} 包含无法可靠 lowering 的 TLS 安全语义。`, { nodeName: name }))
  if (features.includes('tls:invalid-alpn')) issues.push(subscriptionIssue('PROXY_TLS_ALPN_INVALID', 'warning', `${name} 包含非法 ALPN，未静默删除。`, { nodeName: name }))
  if (features.includes('alter-id:invalid')) issues.push(subscriptionIssue('PROXY_VMESS_ALTER_ID_INVALID', 'warning', `${name} 包含非法 VMess alterId，未静默改写为默认值。`, { nodeName: name }))
  if (features.includes('reality:security-none') || features.includes('reality:security-tls')) issues.push(subscriptionIssue('PROXY_VLESS_REALITY_SECURITY_CONFLICT', 'warning', `${name} 的显式 security 与 Reality 字段冲突。`, { nodeName: name }))
  if (features.some((feature) => feature.startsWith('bandwidth:'))) issues.push(subscriptionIssue('PROXY_HYSTERIA2_BANDWIDTH_INVALID', 'warning', `${name} 包含非法显式 Hysteria2 bandwidth，未按未设置值继续。`, { nodeName: name }))
  issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `${name} 包含当前不可靠支持的特性：${features.join(', ')}。`, { nodeName: name }))
  return { status: 'partial', unsupportedFeatures: features }
}

function tlsCriticalFeatures(record: Record<string, unknown>, allowDisableSni = false, tlsEnabled = false) {
  const disableSni = record['disable-sni'] ?? record.disable_sni
  const alpnInvalid = record.alpn !== undefined && (!Array.isArray(record.alpn)
    || record.alpn.some((value) => typeof value !== 'string' || !value.trim()))
  return [
    ...(record.fingerprint !== undefined || record['certificate-fingerprint'] !== undefined ? ['tls:certificate-fingerprint'] : []),
    ...(record.pinSHA256 !== undefined || record['pin-sha256'] !== undefined ? ['tls:pin-sha256'] : []),
    ...(record.ech !== undefined || record['ech-opts'] !== undefined ? ['tls:ech'] : []),
    ...(record['name-cert-verify'] !== undefined ? ['tls:name-cert-verify'] : []),
    ...(record['skip-cert-verify'] !== undefined && booleanValue(record['skip-cert-verify']) === undefined ? ['tls:invalid-allow-insecure'] : []),
    ...(record.tls !== undefined && booleanValue(record.tls) === undefined ? ['tls:invalid-enabled'] : []),
    ...(alpnInvalid ? ['tls:invalid-alpn'] : []),
    ...(invalidOptionalString(record.sni) || invalidOptionalString(record.servername) ? ['tls:invalid-server-name'] : []),
    ...(invalidOptionalString(record['client-fingerprint']) ? ['tls:invalid-client-fingerprint'] : []),
    ...(disableSni !== undefined && booleanValue(disableSni) === undefined ? ['tls:invalid-disable-sni'] : []),
    ...(booleanValue(disableSni) === true && !allowDisableSni ? ['tls:disable-sni'] : []),
    ...(!tlsEnabled && hasTlsOnlyIntent(record) ? ['tls:fields-without-tls'] : []),
  ]
}

function invalidOptionalString(value: unknown) {
  return value !== undefined && value !== null && value !== '' && !stringValue(value)
}

function hasTlsOnlyIntent(record: Record<string, unknown>) {
  const alpn = Array.isArray(record.alpn) && record.alpn.some((value) => typeof value === 'string' && value.trim())
  return Boolean(
    stringValue(record.sni)
    || stringValue(record.servername)
    || booleanValue(record['skip-cert-verify']) === true
    || booleanValue(record['disable-sni'] ?? record.disable_sni) === true
    || alpn
    || stringValue(record['client-fingerprint'])
    || isRecord(record['reality-opts']),
  )
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

const CLASH_COMMON_KEYS = new Set([
  'name', 'type', 'server', 'port', 'username', 'password', 'tls', 'sni', 'servername',
  'skip-cert-verify', 'disable-sni', 'disable_sni', 'alpn', 'network', 'ws-opts', 'http-opts',
  'h2-opts', 'grpc-opts', 'xhttp-opts', 'client-fingerprint', 'uuid', 'flow', 'security',
  'encryption', 'cipher', 'alterId', 'alter-id', 'plugin', 'plugin-opts', 'obfs',
  'obfs-password', 'up', 'down', 'ports', 'hop-interval', 'congestion-controller',
  'udp-relay-mode', 'udp', 'idle-session-check-interval', 'idle-session-timeout', 'min-idle-session', 'httpupgrade-opts',
])

const CLASH_NESTED_KEYS: Record<string, ReadonlySet<string>> = {
  'ws-opts': new Set(['path', 'headers', 'max-early-data', 'early-data-header-name', 'v2ray-http-upgrade']),
  'http-opts': new Set(['path', 'headers']),
  'h2-opts': new Set(['path', 'host']),
  'grpc-opts': new Set(['grpc-service-name']),
  'xhttp-opts': new Set(['path', 'host', 'mode']),
  'httpupgrade-opts': new Set(['path', 'host']),
  'reality-opts': new Set(['public-key', 'short-id']),
}

/** Preserve only fields outside the modeled Clash/Mihomo endpoint contract. */
function opaqueClashPreservation(record: Record<string, unknown>, type: string, origin: OpaqueProxyOrigin) {
  const known = new Set(CLASH_COMMON_KEYS)
  known.add('reality-opts')
  if (type === 'ss') known.add('plugin-opts')
  const fields: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(record)) {
    if (!known.has(key)) {
      const cloned = cloneJsonValue(value)
      if (cloned !== undefined) fields[key] = cloned
      continue
    }
    const nestedKeys = CLASH_NESTED_KEYS[key]
    if (!nestedKeys || !isRecord(value)) continue
    const nested = opaqueNestedFields(value, nestedKeys)
    if (Object.keys(nested).length > 0) fields[key] = nested
  }
  const cloned = cloneJsonObject(fields)
  return cloned && Object.keys(cloned).length > 0 ? { opaque: { origin, fields: cloned } } : {}
}

function opaqueNestedFields(record: Record<string, unknown>, known: ReadonlySet<string>) {
  const fields: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(record)) {
    if (key === 'headers' && isRecord(value)) {
      const headers = opaqueNestedFields(value, new Set(['Host']))
      if (Object.keys(headers).length > 0) fields[key] = headers
      continue
    }
    if (known.has(key)) continue
    const cloned = cloneJsonValue(value)
    if (cloned !== undefined) fields[key] = cloned
  }
  return fields
}

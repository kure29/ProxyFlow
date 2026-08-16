import { parseDocument } from 'yaml'
import { parseClashRecords, type ClashParseResult } from './parseClash'
import type { ParseSubscriptionOptions } from './types'

export function parseStructuredSubscription(input: string, options: ParseSubscriptionOptions, format: 'clash-json' | 'sub-store-json' | 'sing-box-json' | 'v2ray-json' | 'egern'): ClashParseResult | undefined {
  let value: unknown
  try {
    if (format === 'egern') {
      const document = parseDocument(input, { schema: 'core' })
      if (document.errors.length) return undefined
      value = document.toJS({ maxAliasCount: 32 })
    } else value = JSON.parse(input) as unknown
  } catch {
    return undefined
  }
  if (format === 'sub-store-json') return Array.isArray(value) ? parseClashRecords(value.map(toSubStoreRecord), options) : undefined
  if (format === 'clash-json') return isRecord(value) && Array.isArray(value.proxies) ? parseClashRecords(value.proxies, options, Object.keys(value).some((key) => key !== 'proxies')) : undefined
  if (format === 'egern') return isRecord(value) && Array.isArray(value.proxies) ? parseClashRecords(value.proxies.map(toEgernRecord), options, true) : undefined
  if (!isRecord(value) || !Array.isArray(value.outbounds)) return undefined
  if (format === 'sing-box-json') return parseClashRecords(value.outbounds.flatMap((outbound) => toSingBoxRecord(outbound)), options, true)
  return parseClashRecords(value.outbounds.flatMap((outbound) => toV2RayRecord(outbound)), options, true)
}

// The official JSON producer returns JSON.stringify(proxies): an array of the
// backend's normalized proxy objects, not a client config envelope. Keep this
// adapter explicit so it cannot be confused with V2Ray, sing-box, or Clash JSON.
function toSubStoreRecord(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return { type: 'unknown' }
  return { ...raw }
}

function toSingBoxRecord(raw: unknown): Record<string, unknown>[] {
  if (!isRecord(raw)) return []
  const type = stringValue(raw.type)?.toLocaleLowerCase()
  if (!type || ['direct', 'block', 'dns', 'selector', 'urltest', 'group', 'cache-file'].includes(type)) return []
  const server = stringValue(raw.server)
  const port = numberValue(raw.server_port)
  const name = stringValue(raw.tag) ?? `${type} outbound`
  if (!server || !port) return [{ type, name }]
  const record: Record<string, unknown> = { type: type === 'socks' ? 'socks5' : type, name, server, port }
  if (type === 'http' || type === 'socks') {
    if (stringValue(raw.username)) record.username = stringValue(raw.username)
    if (stringValue(raw.password)) record.password = stringValue(raw.password)
  }
  if (type === 'shadowsocks') {
    record.cipher = stringValue(raw.method)
    record.password = stringValue(raw.password)
  }
  if (type === 'trojan' || type === 'hysteria2' || type === 'anytls') record.password = stringValue(raw.password)
  if (type === 'vmess') {
    record.uuid = stringValue(raw.uuid)
    record.alterId = numberValue(raw.alter_id)
    record.security = stringValue(raw.security) ?? 'auto'
  }
  if (type === 'vless') {
    record.uuid = stringValue(raw.uuid)
    record.encryption = stringValue(raw.encryption)
    record.flow = stringValue(raw.flow)
  }
  if (type === 'tuic') {
    record.uuid = stringValue(raw.uuid)
    record.password = stringValue(raw.password)
    record['congestion-controller'] = stringValue(raw.congestion_control)
    record['udp-relay-mode'] = stringValue(raw.udp_relay_mode)
  }
  if (type === 'hysteria2') {
    record.up = numberValue(raw.up_mbps)
    record.down = numberValue(raw.down_mbps)
    const obfs = isRecord(raw.obfs) && stringValue(raw.obfs.type) === 'salamander' ? raw.obfs : undefined
    if (obfs) { record.obfs = 'salamander'; record['obfs-password'] = stringValue(obfs.password) }
    if (Array.isArray(raw.server_ports)) record.ports = raw.server_ports.map(String).join(',')
    const interval = secondsValue(raw.hop_interval)
    if (interval !== undefined) record['hop-interval'] = interval
  }
  applySingBoxTls(record, raw.tls)
  applySingBoxTransport(record, raw.transport)
  return [record]
}

function toV2RayRecord(raw: unknown): Record<string, unknown>[] {
  if (!isRecord(raw)) return []
  const protocol = stringValue(raw.protocol)?.toLocaleLowerCase()
  if (!protocol || ['freedom', 'blackhole', 'dns', 'loopback', 'dnsquery'].includes(protocol)) return []
  const settings = isRecord(raw.settings) ? raw.settings : {}
  const stream = isRecord(raw.streamSettings) ? raw.streamSettings : {}
  const serverRecord = firstServer(settings, protocol)
  const name = stringValue(raw.tag) ?? `${protocol} outbound`
  if (!serverRecord) return [{ type: protocol, name }]
  const record: Record<string, unknown> = { type: protocol, name, server: stringValue(serverRecord.address), port: numberValue(serverRecord.port) }
  if (protocol === 'vmess' || protocol === 'vless') {
    const user = firstObject(serverRecord.users) ?? firstObject(settings.vnext)
    if (user) {
      record.uuid = stringValue(user.id)
      record.alterId = numberValue(user.alterId)
      record.security = stringValue(user.security) ?? 'auto'
      record.encryption = stringValue(user.encryption)
      record.flow = stringValue(user.flow)
    }
  } else if (protocol === 'trojan') record.password = stringValue(serverRecord.password)
  else if (protocol === 'shadowsocks') { record.cipher = stringValue(serverRecord.method); record.password = stringValue(serverRecord.password) }
  else if (protocol === 'socks') { record.type = 'socks5'; const user = firstObject(serverRecord.users); record.username = stringValue(user?.user); record.password = stringValue(user?.pass) }
  else if (protocol === 'http') { const user = firstObject(serverRecord.accounts); record.username = stringValue(user?.user); record.password = stringValue(user?.pass) }
  applyV2RayStream(record, stream)
  return [record]
}

function firstServer(settings: Record<string, unknown>, protocol: string) {
  if (['vmess', 'vless'].includes(protocol)) return firstObject(settings.vnext)?.address ? firstObject(settings.vnext) : undefined
  if (['trojan', 'shadowsocks', 'socks', 'http'].includes(protocol)) return firstObject(settings.servers)
  return undefined
}

function applyV2RayStream(record: Record<string, unknown>, stream: Record<string, unknown>) {
  const security = stringValue(stream.security)
  if (security === 'tls') {
    const tls = isRecord(stream.tlsSettings) ? stream.tlsSettings : {}
    record.tls = true
    if (stringValue(tls.serverName)) record.sni = stringValue(tls.serverName)
    if (tls.allowInsecure !== undefined) record['skip-cert-verify'] = Boolean(tls.allowInsecure)
    if (Array.isArray(tls.alpn)) record.alpn = tls.alpn.map(String)
  }
  const network = stringValue(stream.network)
  if (network === 'ws') {
    const ws = isRecord(stream.wsSettings) ? stream.wsSettings : {}
    const headers = isRecord(ws.headers) ? ws.headers : {}
    record.network = 'ws'
    record['ws-opts'] = { ...(stringValue(ws.path) ? { path: stringValue(ws.path) } : {}), ...(stringValue(headers.Host) ? { headers: { Host: stringValue(headers.Host) } } : {}) }
  } else if (network === 'h2' || network === 'http') {
    const http = isRecord(stream.httpSettings) ? stream.httpSettings : {}
    record.network = network
    record[network === 'h2' ? 'h2-opts' : 'http-opts'] = { ...(stringValue(http.path) ? { path: stringValue(http.path) } : {}), ...(Array.isArray(http.host) ? { host: http.host.map(String) } : {}) }
  } else if (network === 'grpc') {
    const grpc = isRecord(stream.grpcSettings) ? stream.grpcSettings : {}
    record.network = 'grpc'
    record['grpc-opts'] = stringValue(grpc.serviceName) ? { 'grpc-service-name': stringValue(grpc.serviceName) } : {}
  }
}

function applySingBoxTls(record: Record<string, unknown>, raw: unknown) {
  if (!isRecord(raw)) return
  record.tls = raw.enabled !== false
  if (stringValue(raw.server_name)) record.sni = stringValue(raw.server_name)
  if (raw.insecure !== undefined) record['skip-cert-verify'] = Boolean(raw.insecure)
  if (Array.isArray(raw.alpn)) record.alpn = raw.alpn.map(String)
  const utls = isRecord(raw.utls) ? raw.utls : undefined
  const fingerprint = utls ? stringValue(utls.fingerprint) : undefined
  if (fingerprint) record['client-fingerprint'] = fingerprint
}

function applySingBoxTransport(record: Record<string, unknown>, raw: unknown) {
  if (!isRecord(raw)) return
  const type = stringValue(raw.type)
  if (type === 'ws') record.network = 'ws', record['ws-opts'] = { ...(stringValue(raw.path) ? { path: stringValue(raw.path) } : {}), ...(isRecord(raw.headers) ? { headers: raw.headers } : {}) }
  else if (type === 'http') record.network = 'http', record['http-opts'] = { ...(stringValue(raw.path) ? { path: stringValue(raw.path) } : {}), ...(Array.isArray(raw.host) ? { host: raw.host } : stringValue(raw.host) ? { host: stringValue(raw.host) } : {}) }
  else if (type === 'grpc') record.network = 'grpc', record['grpc-opts'] = stringValue(raw.service_name) ? { 'grpc-service-name': stringValue(raw.service_name) } : {}
}

function toEgernRecord(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  const type = stringValue(raw.type)?.toLocaleLowerCase()
  if (!type) return raw
  const record: Record<string, unknown> = { ...raw, name: stringValue(raw.name) ?? 'Egern proxy' }
  if (type === 'https') { record.type = 'http'; record.tls = true }
  // ProxyFlow's normalized SOCKS model has no TLS-bearing SOCKS variant;
  // preserve this endpoint as Unsupported instead of silently dropping TLS.
  if (type === 'socks5_tls') record.type = 'socks5_tls'
  if (type === 'shadowsocks') { record.type = 'ss'; record.cipher = raw.method; record.password = raw.password }
  if (type === 'hysteria2') { record.password = raw.auth; record.ports = raw.port_hopping; record['hop-interval'] = raw.port_hopping_interval; record['obfs-password'] = raw.obfs_password }
  if (type === 'tuic') { record['skip-cert-verify'] = raw.skip_tls_verify; record.ports = raw.port_hopping; record['hop-interval'] = raw.port_hopping_interval }
  if (type === 'anytls') record.password = raw.password
  if (type === 'vmess' || type === 'vless' || type === 'trojan') record.sni = raw.sni, record['skip-cert-verify'] = raw.skip_tls_verify
  return record
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined
}

function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function numberValue(value: unknown): number | undefined { const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : undefined; return number !== undefined && Number.isInteger(number) && number > 0 && number <= 65535 ? number : undefined }
function secondsValue(value: unknown): number | undefined { if (typeof value === 'number') return value > 0 ? value : undefined; const match = typeof value === 'string' ? /^(\d+)s$/.exec(value.trim()) : undefined; return match ? Number(match[1]) : undefined }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

import type { ProxyTlsIR, ProxyTransportIR, ResolvedProxyEndpointIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { shadowrocketIssue } from './errors'
import type { ShadowrocketParameter, ShadowrocketPolicyEntry } from './model'
import { isSafeShadowrocketPolicyName } from './serializer'

const SHADOWSOCKS_METHODS = new Set([
  'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305', '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm',
])
const SIMPLE_OBFS = new Set(['simple-obfs', 'obfs', 'obfs-local'])

export function checkShadowrocketProxy(endpoint: ResolvedProxyEndpointIR, sourceId = endpoint.id): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = []
  const runtime = endpoint as unknown as Record<string, unknown>
  const name = typeof runtime.name === 'string' ? runtime.name : '<unnamed>'
  const protocol = typeof runtime.protocol === 'string' ? runtime.protocol : undefined
  const add = (code: string, message: string, feature = 'proxy') => issues.push(shadowrocketIssue(code, 'error', feature, message, sourceId))
  if (!isSafeServer(runtime.server)) add('SHADOWROCKET_PROXY_SERVER_INVALID', `Proxy "${name}" has an unsafe server value.`)
  if (!Number.isInteger(runtime.port) || Number(runtime.port) < 1 || Number(runtime.port) > 65_535) add('SHADOWROCKET_PROXY_PORT_INVALID', `Proxy "${name}" has an invalid port.`)
  if (!isSafeShadowrocketPolicyName(runtime.name)) add('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an unsafe policy name.`, 'serialization')

  const partial = isRecord(runtime.metadata) && isRecord(runtime.metadata.compatibility) ? runtime.metadata.compatibility : undefined
  const plugin = isRecord(runtime.plugin) ? runtime.plugin : undefined
  const pluginName = typeof plugin?.name === 'string' ? plugin.name.trim().toLowerCase() : undefined
  const handled = protocol === 'shadowsocks' && pluginName ? new Set([`plugin:${pluginName}`]) : new Set<string>()
  const unsupported = toStringArray(partial?.unsupportedFeatures).filter((item) => !handled.has(item.trim().toLowerCase()))
  const unrecognized = toStringArray(partial?.unrecognizedParams)
  if (partial?.status === 'partial' && !(unsupported.length || unrecognized.length)) add(
    'SHADOWROCKET_PROXY_VARIANT_UNPROVEN', `Proxy "${name}" contains partial endpoint metadata that is not proven for Shadowrocket.`, 'proxy-variant',
  )
  if (unsupported.length || unrecognized.length) add(
    'SHADOWROCKET_PROXY_VARIANT_UNSUPPORTED', `Proxy "${name}" contains unsupported endpoint semantics: ${[...unsupported, ...unrecognized].join(', ')}.`, 'proxy-variant',
  )

  switch (endpoint.protocol) {
    case 'http': checkHttp(endpoint, add); break
    case 'socks5': checkAuth(endpoint, add); break
    case 'shadowsocks': checkShadowsocks(endpoint, add); break
    case 'trojan': checkRequired(name, 'password', runtime.password, add); checkTls(name, runtime.tls, add); checkTransport(name, runtime.transport, add); break
    case 'vmess': checkRequired(name, 'uuid', runtime.uuid, add); if (runtime.alterId === undefined || !Number.isInteger(runtime.alterId) || Number(runtime.alterId) < 0) add('SHADOWROCKET_VMESS_VARIANT_UNPROVEN', `Proxy "${name}" has no explicit valid alterId intent.`, 'vmess'); checkTls(name, runtime.tls, add); checkTransport(name, runtime.transport, add); break
    case 'vless': { const tls = isRecord(runtime.tls) ? runtime.tls : undefined; checkRequired(name, 'uuid', runtime.uuid, add); checkTls(name, runtime.tls, add); checkTransport(name, runtime.transport, add); if (runtime.flow || tls?.reality || runtime.security === 'reality') add('SHADOWROCKET_REALITY_UNPROVEN', `Proxy "${name}" uses Reality/Vision flow semantics that are not proven lossless in this adapter.`, 'tls'); break }
    case 'hysteria2': checkRequired(name, 'password', runtime.password, add); checkTls(name, runtime.tls, add); if (runtime.obfs || runtime.upMbps !== undefined || runtime.downMbps !== undefined || Array.isArray(runtime.serverPorts) && runtime.serverPorts.length || runtime.hopInterval) add('SHADOWROCKET_HYSTERIA2_VARIANT_UNPROVEN', `Proxy "${name}" uses Hysteria2 options outside the audited portable subset.`, 'hysteria2'); break
    case 'tuic': checkRequired(name, 'uuid', runtime.uuid, add); checkRequired(name, 'password', runtime.password, add); checkTls(name, runtime.tls, add); if (runtime.congestionControl || runtime.udpRelayMode) add('SHADOWROCKET_TUIC_VARIANT_UNPROVEN', `Proxy "${name}" uses TUIC options outside the audited portable subset.`, 'tuic'); break
    case 'anytls': checkRequired(name, 'password', runtime.password, add); checkTls(name, runtime.tls, add); if (runtime.udpEnabled === false || runtime.idleSessionCheckIntervalSeconds !== undefined || runtime.idleSessionTimeoutSeconds !== undefined || runtime.minIdleSession !== undefined) add('SHADOWROCKET_ANYTLS_VARIANT_UNPROVEN', `Proxy "${name}" uses AnyTLS session or UDP-disable intent outside the audited portable subset.`, 'anytls'); break
    default: {
      add('SHADOWROCKET_PROXY_PROTOCOL_UNSUPPORTED', `Proxy "${name}" uses an unrecognized protocol.`)
    }
  }
  return issues
}

export function compileShadowrocketProxy(endpoint: ResolvedProxyEndpointIR): ShadowrocketPolicyEntry | undefined {
  const common = { name: endpoint.name, arguments: [endpoint.server, endpoint.port] }
  switch (endpoint.protocol) {
    case 'http': return { ...common, type: endpoint.tls?.enabled ? 'https' : 'http', parameters: [...authParameters(endpoint), ...tlsParameters(endpoint.tls)] }
    case 'socks5': return { ...common, type: 'socks5', parameters: [...authParameters(endpoint)] }
    case 'shadowsocks': return { ...common, type: 'ss', parameters: [{ key: 'encrypt-method', value: endpoint.method }, { key: 'password', value: endpoint.password }, ...simpleObfs(endpoint.plugin)] }
    case 'trojan': return { ...common, type: 'trojan', parameters: [{ key: 'password', value: endpoint.password }, ...transportParameters(endpoint.transport), ...tlsParameters(endpoint.tls)] }
    case 'vmess': return { ...common, type: 'vmess', parameters: [{ key: 'uuid', value: endpoint.uuid }, { key: 'alterId', value: endpoint.alterId ?? 0 }, { key: 'security', value: endpoint.security }, ...transportParameters(endpoint.transport), ...tlsParameters(endpoint.tls)] }
    case 'vless': return { ...common, type: 'vless', parameters: [{ key: 'uuid', value: endpoint.uuid }, ...(endpoint.encryption ? [{ key: 'encryption', value: endpoint.encryption }] : []), ...(endpoint.flow ? [{ key: 'flow', value: endpoint.flow }] : []), ...transportParameters(endpoint.transport), ...tlsParameters(endpoint.tls)] }
    case 'hysteria2': return { ...common, type: 'hysteria2', parameters: [{ key: 'password', value: endpoint.password }, ...tlsParameters(endpoint.tls)] }
    case 'tuic': return { ...common, type: 'tuic', parameters: [{ key: 'uuid', value: endpoint.uuid }, { key: 'password', value: endpoint.password }, ...tlsParameters(endpoint.tls)] }
    case 'anytls': return { ...common, type: 'anytls', parameters: [{ key: 'password', value: endpoint.password }, ...tlsParameters(endpoint.tls)] }
    default: return undefined
  }
}

function checkHttp(endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'http' }>, add: AddIssue) {
  checkAuth(endpoint, add)
  checkTls(endpoint.name, endpoint.tls, add)
}

function checkShadowsocks(endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>, add: AddIssue) {
  const runtime = endpoint as unknown as Record<string, unknown>
  const name = typeof runtime.name === 'string' ? runtime.name : '<unnamed>'
  const method = typeof runtime.method === 'string' ? runtime.method : ''
  const normalizedMethod = method.toLowerCase()
  if (!SHADOWSOCKS_METHODS.has(normalizedMethod)) add('SHADOWROCKET_SHADOWSOCKS_CIPHER_UNPROVEN', `Proxy "${name}" uses an unproven Shadowsocks cipher "${method}".`, 'proxy-cipher')
  checkRequired(name, 'password', runtime.password, add)
  const expectedBytes = ({
    '2022-blake3-aes-128-gcm': 16,
    '2022-blake3-aes-256-gcm': 32,
  } as Record<string, number | undefined>)[normalizedMethod]
  const password = typeof runtime.password === 'string' ? runtime.password : ''
  if (expectedBytes && password.split(':').some((key) => decodedBase64Length(key) !== expectedBytes)) add('SHADOWROCKET_SHADOWSOCKS_2022_KEY_INVALID', `Proxy "${name}" has invalid ${expectedBytes}-byte Base64 Shadowsocks 2022 key material.`, 'proxy-cipher')
  const plugin = isRecord(runtime.plugin) ? runtime.plugin : undefined
  if (plugin) {
    const pluginName = typeof plugin.name === 'string' ? plugin.name.trim().toLowerCase() : ''
    if (!SIMPLE_OBFS.has(pluginName)) add('SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN', `Proxy "${name}" uses plugin "${String(plugin.name ?? '')}" without a proven Shadowrocket mapping.`, 'proxy-variant')
    else {
      const parsed = parseSimpleObfsOptions(plugin.options as SimpleObfsOptions)
      if ('error' in parsed) add('SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN', `Proxy "${name}" uses simple-obfs options that cannot be mapped losslessly: ${parsed.error}.`, 'proxy-variant')
      else if (parsed.mode !== 'http' && parsed.mode !== 'tls') add('SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN', `Proxy "${name}" must provide an explicit lowercase http or tls simple-obfs mode.`, 'proxy-variant')
      else if (parsed.host !== undefined && !isSafeServer(parsed.host)) add('SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN', `Proxy "${name}" has an unsafe simple-obfs host.`, 'proxy-variant')
      else if (parsed.path !== undefined && (!parsed.path.startsWith('/') || !isSafeValue(parsed.path))) add('SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN', `Proxy "${name}" has an unsafe simple-obfs path.`, 'proxy-variant')
    }
  }
}

function checkAuth(endpoint: { name: string; username?: string; password?: string }, add: AddIssue) {
  const runtime = endpoint as unknown as Record<string, unknown>
  const name = typeof runtime.name === 'string' ? runtime.name : '<unnamed>'
  const username = runtime.username
  const password = runtime.password
  if ((username === undefined) !== (password === undefined) || username !== undefined && (!isSafeValue(username) || !isSafeValue(password))) add('SHADOWROCKET_PROXY_AUTH_UNSUPPORTED', `Proxy "${name}" must provide both non-empty username and password, or neither.`, 'authentication')
  for (const [field, value] of [['username', username], ['password', password]] as const) if (value !== undefined && !isSafeValue(value)) add('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an unsafe ${field}.`, 'serialization')
}

function checkRequired(name: string, field: string, value: unknown, add: AddIssue) { if (!isSafeValue(value)) add('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an empty or unsafe ${field}.`, 'serialization') }

function checkTls(name: string, tls: unknown, add: AddIssue) {
  if (tls === undefined || tls === null) return
  if (!isRecord(tls)) { add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" has malformed TLS intent.`, 'tls'); return }
  const alpn = tls.alpn
  if (tls.reality || tls.fingerprint || tls.disableSni) add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" uses Reality, fingerprint, or disable-SNI intent outside the audited portable subset.`, 'tls')
  if (tls.serverName !== undefined && !isSafeValue(tls.serverName)) add('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an unsafe TLS server name.`, 'serialization')
  if (alpn !== undefined && !Array.isArray(alpn)) add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" has malformed ALPN intent.`, 'tls')
  if (Array.isArray(alpn) && alpn.some((value) => !isSafeValue(value))) add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" has unsafe ALPN intent.`, 'tls')
  if (Array.isArray(alpn) && alpn.length) add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" has ALPN intent whose Shadowrocket spelling is not pinned.`, 'tls')
  if (tls.enabled !== undefined && typeof tls.enabled !== 'boolean') add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" has malformed TLS enabled intent.`, 'tls')
  if (!tls.enabled && (tls.serverName || tls.allowInsecure || Array.isArray(alpn) && alpn.length)) add('SHADOWROCKET_TLS_VARIANT_UNPROVEN', `Proxy "${name}" has TLS-only fields while TLS is disabled.`, 'tls')
}

function checkTransport(name: string, transport: unknown, add: AddIssue) {
  if (transport === undefined || transport === null) return
  if (!isRecord(transport)) { add('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN', `Proxy "${name}" has malformed transport intent.`, 'transport'); return }
  const kind = transport.kind
  if (kind === 'tcp') return
  if (kind !== 'ws') { add('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN', `Proxy "${name}" uses ${String(kind)} transport outside the audited TCP/WebSocket subset.`, 'transport'); return }
  if (transport.path !== undefined && (typeof transport.path !== 'string' || !transport.path.startsWith('/') || !isSafeValue(transport.path))) add('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has unsafe WebSocket transport fields.`, 'serialization')
  if (transport.host !== undefined && !isSafeValue(transport.host)) add('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has unsafe WebSocket transport fields.`, 'serialization')
  if (transport.maxEarlyData !== undefined || transport.earlyDataHeaderName !== undefined) add('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN', `Proxy "${name}" uses WebSocket early-data intent outside the audited subset.`, 'transport')
}

function authParameters(endpoint: { username?: string; password?: string }): ShadowrocketParameter[] { return [...(endpoint.username !== undefined ? [{ key: 'username', value: endpoint.username }] : []), ...(endpoint.password !== undefined ? [{ key: 'password', value: endpoint.password }] : [])] }
function tlsParameters(tls?: ProxyTlsIR): ShadowrocketParameter[] { if (!tls?.enabled) return []; return [...(tls.serverName ? [{ key: 'sni', value: tls.serverName }] : []), ...(tls.allowInsecure ? [{ key: 'skip-cert-verify', value: true }] : []), ...(tls.alpn?.length ? [{ key: 'alpn', value: tls.alpn.join('|') }] : [])] }
function transportParameters(transport?: ProxyTransportIR): ShadowrocketParameter[] {
  if (!transport || transport.kind === 'tcp') return []
  if (transport.kind !== 'ws') return []
  return [{ key: 'ws', value: true }, ...(transport.path ? [{ key: 'ws-path', value: transport.path }] : []), ...(transport.host ? [{ key: 'ws-headers', value: `Host:${transport.host}` }] : [])]
}
function simpleObfs(plugin: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>['plugin']): ShadowrocketParameter[] {
  if (!plugin) return []
  if (!SIMPLE_OBFS.has(plugin.name.trim().toLowerCase())) return []
  const parsed = parseSimpleObfsOptions(plugin.options)
  if ('error' in parsed || parsed.mode !== 'http' && parsed.mode !== 'tls') return []
  return [{ key: 'obfs', value: parsed.mode }, ...(parsed.host ? [{ key: 'obfs-host', value: parsed.host }] : []), ...(parsed.path ? [{ key: 'obfs-uri', value: parsed.path }] : [])]
}

function parseSimpleObfsOptions(
  options: NonNullable<Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>['plugin']>['options'],
): { mode?: string; host?: string; path?: string } | { error: string } {
  const entries: Array<[string, string | number | boolean]> = []
  if (typeof options === 'string') {
    for (const token of options.split(';')) {
      if (!token) continue
      const separator = token.indexOf('=')
      if (separator <= 0) return { error: `option "${token}" is not a key=value pair` }
      entries.push([token.slice(0, separator).trim(), token.slice(separator + 1)])
    }
  } else if (options) entries.push(...Object.entries(options))

  const result: { mode?: string; host?: string; path?: string } = {}
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().toLowerCase()
    const field = key === 'mode' || key === 'obfs'
      ? 'mode'
      : key === 'host' || key === 'obfs-host'
        ? 'host'
        : key === 'path' || key === 'uri' || key === 'obfs-uri'
          ? 'path'
          : undefined
    if (!field) return { error: `option "${rawKey}" is outside the audited simple-obfs subset` }
    if (typeof rawValue !== 'string') return { error: `option "${rawKey}" is not a string` }
    if (result[field] !== undefined) return { error: `option "${rawKey}" duplicates ${field} intent` }
    if (!rawValue) return { error: `option "${rawKey}" is empty` }
    result[field] = field === 'mode' ? rawValue.toLowerCase() : rawValue
  }
  return result
}

type AddIssue = (code: string, message: string, feature?: string) => void
type SimpleObfsOptions = NonNullable<Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>['plugin']>['options']
function isSafeServer(value: unknown) { return isSafeValue(value) && !/[/?#]/.test(value as string) }
function isSafeValue(value: unknown): value is string { return typeof value === 'string' && Boolean(value) && value === value.trim() && !/[\r\n\u0000-\u001f\u007f,=\\"]/.test(value) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function toStringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function decodedBase64Length(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return -1
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return value.length / 4 * 3 - padding
}

import type { ProxyTlsIR, ProxyTransportIR, ResolvedProxyEndpointIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'
import type { SurgeParameter, SurgePolicyEntry } from './model'

const SURGE_SHADOWSOCKS_METHODS = new Set([
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  'aes-128-gcm',
  'aes-192-gcm',
  'aes-256-gcm',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  'rc4-md5',
  'aes-128-cfb',
  'aes-192-cfb',
  'aes-256-cfb',
  'aes-128-ctr',
  'aes-192-ctr',
  'aes-256-ctr',
  'chacha20-ietf',
  'none',
])

export function checkSurgeProxy(endpoint: ResolvedProxyEndpointIR, sourceId: string) {
  const issues: CompatibilityIssue[] = []
  const add = (code: string, message: string) => issues.push(surgeIssue(code, 'error', 'proxy', message, sourceId))
  const partial = endpoint.metadata?.compatibility
  if (partial?.status === 'partial' || partial?.unsupportedFeatures?.length || partial?.unrecognizedParams?.length) add(
    'SURGE_PROXY_VARIANT_UNSUPPORTED',
    `Proxy “${endpoint.name}” contains endpoint semantics that the Surge compiler cannot prove lossless: ${[
      ...(partial?.unsupportedFeatures ?? []), ...(partial?.unrecognizedParams ?? []),
    ].join(', ') || 'partial endpoint metadata'}.`,
  )
  if (!isSafeServer(endpoint.server)) add('SURGE_PROXY_SERVER_INVALID', `Proxy “${endpoint.name}” has a server value that is unsafe or invalid in a Surge profile.`)

  switch (endpoint.protocol) {
    case 'http':
      checkAuth(endpoint, add)
      checkTls(endpoint.name, endpoint.tls, add)
      break
    case 'socks5':
      checkAuth(endpoint, add)
      break
    case 'shadowsocks':
      if (!SURGE_SHADOWSOCKS_METHODS.has(endpoint.method.toLowerCase())) add(
        'SURGE_SHADOWSOCKS_METHOD_UNSUPPORTED',
        `Proxy “${endpoint.name}” uses Shadowsocks method “${endpoint.method}”, which is not in the current Surge method list.`,
      )
      if (endpoint.method !== endpoint.method.toLowerCase()) add(
        'SURGE_SHADOWSOCKS_METHOD_NONCANONICAL',
        `Proxy “${endpoint.name}” uses non-canonical Shadowsocks method spelling “${endpoint.method}”; current Surge documents lowercase method tokens only.`,
      )
      if (endpoint.plugin) add(
        'SURGE_SHADOWSOCKS_PLUGIN_UNSUPPORTED',
        `Proxy “${endpoint.name}” uses a Shadowsocks plugin that cannot be mapped to Surge without changing its semantics.`,
      )
      checkRequiredValue(endpoint.name, 'password', endpoint.password, add)
      checkShadowsocks2022Key(endpoint.name, endpoint.method, endpoint.password, add)
      break
    case 'trojan':
      checkRequiredValue(endpoint.name, 'password', endpoint.password, add)
      checkTls(endpoint.name, endpoint.tls, add)
      checkWebSocketTransport(endpoint.name, endpoint.transport, add)
      break
    case 'vmess':
      add(
        'SURGE_PROXY_PROTOCOL_UNSUPPORTED',
        `Proxy “${endpoint.name}” uses VMess, but Universal IR does not retain Surge's required vmess-aead intent independently of alterId.`,
      )
      break
    case 'vless':
      add('SURGE_PROXY_PROTOCOL_UNSUPPORTED', `Proxy “${endpoint.name}” uses VLESS, which is not supported by the current official Surge profile format.`)
      break
    case 'hysteria2':
      checkRequiredValue(endpoint.name, 'password', endpoint.password, add)
      checkTls(endpoint.name, endpoint.tls, add)
      if (endpoint.obfs) add(
        'SURGE_HYSTERIA2_OBFS_UNSUPPORTED',
        `Proxy “${endpoint.name}” uses Hysteria 2 obfuscation, whose current Surge support is not portable across both product platforms.`,
      )
      if (endpoint.upMbps !== undefined) add(
        'SURGE_HYSTERIA2_UPLOAD_BANDWIDTH_UNSUPPORTED',
        `Proxy “${endpoint.name}” has upload bandwidth intent, but Surge exposes only download-bandwidth.`,
      )
      if (endpoint.hopInterval?.kind === 'range') add(
        'SURGE_HYSTERIA2_HOP_INTERVAL_UNSUPPORTED',
        `Proxy “${endpoint.name}” uses a ranged port-hopping interval; Surge accepts only one fixed interval.`,
      )
      if (endpoint.hopInterval && !endpoint.serverPorts?.length) add(
        'SURGE_HYSTERIA2_HOP_INTERVAL_UNSUPPORTED',
        `Proxy “${endpoint.name}” has a port-hopping interval without a port-hopping selection.`,
      )
      break
    case 'tuic':
      checkRequiredValue(endpoint.name, 'password', endpoint.password, add)
      checkTls(endpoint.name, endpoint.tls, add)
      if (endpoint.congestionControl) add(
        'SURGE_TUIC_CONGESTION_CONTROL_UNSUPPORTED',
        `Proxy “${endpoint.name}” has explicit congestion-control intent that the current Surge TUIC profile fields cannot express.`,
      )
      if (endpoint.udpRelayMode) add(
        'SURGE_TUIC_UDP_RELAY_MODE_UNSUPPORTED',
        `Proxy “${endpoint.name}” has an explicit UDP relay mode that the current Surge TUIC profile fields cannot express.`,
      )
      break
    case 'anytls':
      checkRequiredValue(endpoint.name, 'password', endpoint.password, add)
      checkTls(endpoint.name, endpoint.tls, add)
      if (endpoint.udpEnabled === false) add(
        'SURGE_ANYTLS_UDP_DISABLE_UNSUPPORTED',
        `Proxy “${endpoint.name}” disables AnyTLS UDP, while Surge enables AnyTLS UDP relay without a disable field.`,
      )
      if (endpoint.idleSessionCheckIntervalSeconds !== undefined
        || endpoint.idleSessionTimeoutSeconds !== undefined
        || endpoint.minIdleSession !== undefined) add(
        'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED',
        `Proxy “${endpoint.name}” has AnyTLS idle-session parameters that are not present in the current Surge profile format.`,
      )
      break
  }
  return issues
}

export function compileSurgeProxy(endpoint: ResolvedProxyEndpointIR): SurgePolicyEntry | undefined {
  const common = { name: endpoint.name, arguments: [endpoint.server, endpoint.port] }
  switch (endpoint.protocol) {
    case 'http': return {
      ...common,
      type: endpoint.tls?.enabled ? 'https' : 'http',
      parameters: [...authParameters(endpoint), ...tlsParameters(endpoint.tls)],
    }
    case 'socks5': return {
      ...common,
      type: 'socks5',
      // The normalized endpoint contract treats SOCKS5/SS as UDP-capable (the
      // existing Mihomo lowering does the same); Surge requires an explicit opt-in.
      parameters: [...authParameters(endpoint), parameter('udp-relay', true)],
    }
    case 'shadowsocks': return {
      ...common,
      type: 'ss',
      parameters: [
        parameter('encrypt-method', endpoint.method),
        parameter('password', endpoint.password),
        parameter('udp-relay', true),
      ],
    }
    case 'trojan': return {
      ...common,
      type: 'trojan',
      parameters: [parameter('password', endpoint.password), ...transportParameters(endpoint.transport), ...tlsParameters(endpoint.tls)],
    }
    case 'hysteria2': return {
      ...common,
      type: 'hysteria2',
      parameters: [
        parameter('password', endpoint.password),
        ...(endpoint.downMbps !== undefined ? [parameter('download-bandwidth', endpoint.downMbps)] : []),
        ...(endpoint.serverPorts?.length ? [parameter('port-hopping', endpoint.serverPorts.map((port) => port.kind === 'single' ? port.port : `${port.start}-${port.end}`).join(';'))] : []),
        ...(endpoint.hopInterval?.kind === 'fixed' ? [parameter('port-hopping-interval', endpoint.hopInterval.seconds)] : []),
        ...tlsParameters(endpoint.tls),
      ],
    }
    case 'tuic': return {
      ...common,
      type: 'tuic-v5',
      parameters: [parameter('uuid', endpoint.uuid), parameter('password', endpoint.password), ...tlsParameters(endpoint.tls)],
    }
    case 'anytls': return {
      ...common,
      type: 'anytls',
      parameters: [parameter('password', endpoint.password), ...tlsParameters(endpoint.tls)],
    }
    case 'vmess':
    case 'vless':
      return undefined
  }
}

function authParameters(endpoint: { username?: string; password?: string }) {
  return [
    ...(endpoint.username !== undefined ? [parameter('username', endpoint.username)] : []),
    ...(endpoint.password !== undefined ? [parameter('password', endpoint.password)] : []),
  ]
}

function tlsParameters(tls?: ProxyTlsIR): SurgeParameter[] {
  if (!tls?.enabled) return []
  return [
    ...(tls.disableSni ? [parameter('sni', 'off')] : tls.serverName ? [parameter('sni', tls.serverName)] : []),
    ...(tls.allowInsecure ? [parameter('skip-cert-verify', true)] : []),
    ...(tls.alpn?.length ? [parameter('alpn', tls.alpn.join(','))] : []),
  ]
}

function checkShadowsocks2022Key(
  name: string,
  method: string,
  password: string,
  add: (code: string, message: string) => void,
) {
  const expectedBytes = ({
    '2022-blake3-aes-128-gcm': 16,
    '2022-blake3-aes-256-gcm': 32,
  } as const)[method as '2022-blake3-aes-128-gcm' | '2022-blake3-aes-256-gcm']
  if (!expectedBytes) return
  const keys = password.split(':')
  if ((keys.length !== 1 && keys.length !== 2) || keys.some((key) => decodedBase64Length(key) !== expectedBytes)) add(
    'SURGE_SHADOWSOCKS_2022_KEY_INVALID',
    `Proxy “${name}” must use ${expectedBytes}-byte Base64 Shadowsocks 2022 key material${keys.length > 1 ? ' on both sides of serverKey:userKey' : ''}.`,
  )
}

function decodedBase64Length(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return -1
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return value.length / 4 * 3 - padding
}

function transportParameters(transport?: ProxyTransportIR): SurgeParameter[] {
  if (!transport || transport.kind === 'tcp') return []
  if (transport.kind !== 'ws') return []
  return [
    parameter('ws', true),
    ...(transport.path ? [parameter('ws-path', transport.path)] : []),
    ...(transport.host ? [parameter('ws-headers', `Host:${transport.host}`)] : []),
  ]
}

function checkAuth(
  endpoint: { name: string; username?: string; password?: string },
  add: (code: string, message: string) => void,
) {
  if ((endpoint.username === undefined) !== (endpoint.password === undefined)
    || endpoint.username !== undefined && (!endpoint.username.length || !endpoint.password?.length)) add(
    'SURGE_PROXY_AUTH_UNSUPPORTED',
    `Proxy “${endpoint.name}” must provide both non-empty username and password, or neither, for Surge authentication.`,
  )
  for (const [field, value] of [['username', endpoint.username], ['password', endpoint.password]] as const) {
    if (value !== undefined && !isSafeValue(value)) add('SURGE_PROXY_VALUE_UNSAFE', `Proxy “${endpoint.name}” has an unsafe ${field} value.`)
  }
}

function checkRequiredValue(
  name: string,
  field: string,
  value: string,
  add: (code: string, message: string) => void,
) {
  if (!value || !isSafeValue(value)) add('SURGE_PROXY_VALUE_UNSAFE', `Proxy “${name}” has an empty or unsafe ${field} value.`)
}

function checkTls(name: string, tls: ProxyTlsIR | undefined, add: (code: string, message: string) => void) {
  if (!tls) return
  if (tls.fingerprint) add(
    'SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED',
    `Proxy “${name}” has a TLS client fingerprint; Surge's server-cert-fingerprint-sha256 is certificate pinning and is not equivalent.`,
  )
  if (tls.reality) add('SURGE_TLS_REALITY_UNSUPPORTED', `Proxy “${name}” has Reality TLS intent, which the current Surge profile format cannot express.`)
  if (tls.serverName && !isSafeServer(tls.serverName)) add('SURGE_TLS_SERVER_NAME_INVALID', `Proxy “${name}” has an invalid TLS server name.`)
  if (tls.alpn?.some((value) => !value || /[\s,\r\n\u0000-\u001f\u007f]/.test(value))) add(
    'SURGE_TLS_ALPN_UNSUPPORTED',
    `Proxy “${name}” has an ALPN token that cannot be represented losslessly in Surge.`,
  )
}

function checkWebSocketTransport(
  name: string,
  transport: ProxyTransportIR | undefined,
  add: (code: string, message: string) => void,
) {
  if (!transport || transport.kind === 'tcp') return
  if (transport.kind !== 'ws') {
    add('SURGE_PROXY_TRANSPORT_UNSUPPORTED', `Proxy “${name}” uses ${transport.kind} transport, which this Surge compiler cannot lower without loss.`)
    return
  }
  if (transport.path && (!transport.path.startsWith('/') || !isSafeValue(transport.path))) add(
    'SURGE_PROXY_TRANSPORT_UNSUPPORTED', `Proxy “${name}” has an invalid Surge WebSocket path.`,
  )
  if (transport.host && (!isSafeServer(transport.host) || transport.host.includes('|'))) add(
    'SURGE_PROXY_TRANSPORT_UNSUPPORTED', `Proxy “${name}” has a WebSocket Host header that cannot be represented safely in Surge.`,
  )
  if (transport.maxEarlyData !== undefined || transport.earlyDataHeaderName !== undefined) add(
    'SURGE_PROXY_TRANSPORT_UNSUPPORTED', `Proxy “${name}” has WebSocket early-data intent that the current Surge profile format cannot express.`,
  )
}

function parameter(key: string, value: string | number | boolean): SurgeParameter {
  return { key, value }
}

function isSafeValue(value: string) {
  return !/[\r\n\u0000-\u001f\u007f]/.test(value)
}

function isSafeServer(value: string) {
  return Boolean(value) && value === value.trim() && !/[\s,=\r\n\u0000-\u001f\u007f]/.test(value)
}

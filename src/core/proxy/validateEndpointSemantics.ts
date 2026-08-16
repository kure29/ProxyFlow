import type { ProxyTlsIR, ProxyTransportIR, ResolvedProxyEndpointIR } from './model'

export interface ProxyEndpointSemanticIssue {
  code: string
  feature: string
  message: string
}

const TLS_REQUIRED_PROTOCOLS = new Set(['trojan', 'hysteria2', 'tuic'])
const VLESS_SECURITY_VALUES = new Set(['none', 'tls', 'reality'])
const CLIENT_FINGERPRINT_VALUES = new Set(['chrome', 'firefox', 'edge', 'safari', '360', 'qq', 'ios', 'android', 'random', 'randomized'])

export function validateProxyEndpointSemantics(endpoint: ResolvedProxyEndpointIR): ProxyEndpointSemanticIssue[] {
  const issues: ProxyEndpointSemanticIssue[] = []
  const add = (code: string, feature: string, message: string) => {
    if (!issues.some((issue) => issue.code === code && issue.feature === feature)) issues.push({ code, feature, message })
  }
  const tls = 'tls' in endpoint ? endpoint.tls : undefined

  if (tls && typeof tls.enabled !== 'boolean') add(
    'PROXY_TLS_ENABLED_INVALID', 'tls:invalid-enabled',
    `Proxy endpoint "${endpoint.name}" has a non-boolean TLS enabled state.`,
  )
  if (TLS_REQUIRED_PROTOCOLS.has(endpoint.protocol) && tls?.enabled !== true) add(
    'PROXY_TLS_REQUIRED', 'tls:required', `Proxy endpoint "${endpoint.name}" requires TLS for ${endpoint.protocol}.`,
  )
  if (tls && tls.enabled !== true && hasEnabledTlsIntent(tls)) add(
    'PROXY_TLS_DISABLED_WITH_SECURITY_FIELDS', 'tls:disabled-with-security-fields',
    `Proxy endpoint "${endpoint.name}" disables TLS while retaining TLS-only security intent.`,
  )
  if (tls?.alpn && (!Array.isArray(tls.alpn) || tls.alpn.length === 0 || tls.alpn.some((value) => typeof value !== 'string' || !value.trim()))) add(
    'PROXY_TLS_ALPN_INVALID', 'tls:alpn-invalid', `Proxy endpoint "${endpoint.name}" has an invalid ALPN list.`,
  )
  if (tls?.fingerprint !== undefined) {
    const fingerprint = typeof tls.fingerprint === 'string' ? tls.fingerprint : String(tls.fingerprint)
    if (!CLIENT_FINGERPRINT_VALUES.has(fingerprint)) add(
      'PROXY_TLS_FINGERPRINT_UNSUPPORTED', `tls:fingerprint:${fingerprint || 'empty'}`,
      `Proxy endpoint "${endpoint.name}" has an unsupported TLS client fingerprint intent.`,
    )
  }
  if (tls?.reality) {
    if (endpoint.protocol !== 'vless') add(
      'PROXY_REALITY_PROTOCOL_UNSUPPORTED', 'reality:protocol',
      `Proxy endpoint "${endpoint.name}" carries Reality intent on a non-VLESS protocol.`,
    )
    if (tls.enabled !== true) add(
      'PROXY_REALITY_TLS_REQUIRED', 'reality:tls-required',
      `Proxy endpoint "${endpoint.name}" carries Reality intent while TLS is disabled.`,
    )
    if (typeof tls.reality.publicKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(tls.reality.publicKey)) add(
      'PROXY_REALITY_PUBLIC_KEY_INVALID', 'reality:invalid-public-key',
      `Proxy endpoint "${endpoint.name}" has an invalid Reality public key.`,
    )
    if (typeof tls.serverName !== 'string' || !tls.serverName.trim()) add(
      'PROXY_REALITY_SERVER_NAME_REQUIRED', 'reality:missing-server-name',
      `Proxy endpoint "${endpoint.name}" requires an explicit Reality server name.`,
    )
    if (tls.reality.shortId && (typeof tls.reality.shortId !== 'string' || !/^[0-9a-f]+$/i.test(tls.reality.shortId) || tls.reality.shortId.length > 16 || tls.reality.shortId.length % 2 !== 0)) add(
      'PROXY_REALITY_SHORT_ID_INVALID', 'reality:invalid-short-id',
      `Proxy endpoint "${endpoint.name}" has an invalid Reality short ID.`,
    )
  }

  if (endpoint.protocol === 'vless') validateVless(endpoint, add)
  if (endpoint.protocol === 'hysteria2') validateHysteria2(endpoint, add)
  if ('transport' in endpoint && endpoint.transport) {
    validateTransport(endpoint.name, endpoint.transport, add)
    if (endpoint.transport.kind === 'xhttp' && endpoint.protocol !== 'vless') add(
      'PROXY_XHTTP_PROTOCOL_UNSUPPORTED', 'xhttp:requires-vless',
      `Proxy endpoint "${endpoint.name}" carries XHTTP intent on a non-VLESS protocol.`,
    )
  }
  return issues
}

function validateVless(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'vless' }>,
  add: (code: string, feature: string, message: string) => void,
) {
  const rawSecurity: unknown = endpoint.security
  if (rawSecurity !== undefined && !VLESS_SECURITY_VALUES.has(String(rawSecurity))) add(
    'PROXY_VLESS_SECURITY_UNSUPPORTED', `security:${String(rawSecurity)}`,
    `VLESS endpoint "${endpoint.name}" has an unsupported security intent.`,
  )
  const security = VLESS_SECURITY_VALUES.has(String(rawSecurity))
    ? rawSecurity as 'none' | 'tls' | 'reality'
    : endpoint.tls?.reality ? 'reality' : endpoint.tls?.enabled ? 'tls' : 'none'
  const rawFlow: unknown = endpoint.flow
  if (rawFlow !== undefined && rawFlow !== 'xtls-rprx-vision') add(
    'PROXY_VLESS_FLOW_UNSUPPORTED', `flow:${String(rawFlow)}`,
    `VLESS endpoint "${endpoint.name}" has an unsupported flow intent.`,
  )
  const rawEncryption: unknown = endpoint.encryption
  if (rawEncryption !== undefined && rawEncryption !== 'none') add(
    'PROXY_VLESS_ENCRYPTION_UNSUPPORTED', `encryption:${String(rawEncryption)}`,
    `VLESS endpoint "${endpoint.name}" has unsupported encryption intent.`,
  )

  if (security === 'none' && endpoint.tls?.enabled === true) add(
    'PROXY_VLESS_SECURITY_TLS_CONFLICT', 'security:tls-conflict',
    `VLESS endpoint "${endpoint.name}" explicitly disables security while TLS is enabled.`,
  )
  if (security === 'none' && endpoint.tls?.reality) add(
    'PROXY_VLESS_REALITY_SECURITY_CONFLICT', 'reality:security-none',
    `VLESS endpoint "${endpoint.name}" explicitly disables security while retaining Reality intent.`,
  )
  if (security === 'tls' && endpoint.tls?.reality) add(
    'PROXY_VLESS_REALITY_SECURITY_CONFLICT', 'reality:security-tls',
    `VLESS endpoint "${endpoint.name}" declares ordinary TLS while retaining Reality-only fields.`,
  )
  if (security === 'tls' && endpoint.tls?.enabled !== true) add(
    'PROXY_VLESS_TLS_REQUIRED', 'tls:security-required',
    `VLESS endpoint "${endpoint.name}" declares TLS security while TLS is disabled.`,
  )
  if (security === 'reality' && (endpoint.tls?.enabled !== true || !endpoint.tls.reality)) add(
    'PROXY_VLESS_REALITY_REQUIRED', 'reality:required',
    `VLESS endpoint "${endpoint.name}" declares Reality without complete enabled Reality TLS intent.`,
  )
  if (endpoint.flow === 'xtls-rprx-vision' && (endpoint.tls?.enabled !== true || security === 'none')) add(
    'PROXY_VLESS_VISION_TLS_REQUIRED', 'flow:vision-requires-tls',
    `VLESS endpoint "${endpoint.name}" uses Vision without an enabled secure TLS intent.`,
  )
}

function validateHysteria2(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'hysteria2' }>,
  add: (code: string, feature: string, message: string) => void,
) {
  if (endpoint.serverPorts !== undefined && (!Array.isArray(endpoint.serverPorts) || endpoint.serverPorts.some(invalidPortSelection))) add(
    'PROXY_HYSTERIA2_PORT_HOPPING_INVALID', 'port-hopping:invalid-range',
    `Hysteria2 endpoint "${endpoint.name}" has an invalid port hopping selection.`,
  )
  if (endpoint.hopInterval && (endpoint.hopInterval.kind === 'fixed'
    ? !positiveInteger(endpoint.hopInterval.seconds)
    : !positiveInteger(endpoint.hopInterval.minSeconds) || !positiveInteger(endpoint.hopInterval.maxSeconds)
      || endpoint.hopInterval.minSeconds > endpoint.hopInterval.maxSeconds)) add(
    'PROXY_HYSTERIA2_HOP_INTERVAL_INVALID', 'port-hopping:invalid-interval',
    `Hysteria2 endpoint "${endpoint.name}" has an invalid hop interval.`,
  )
  if (endpoint.upMbps !== undefined && !positiveFinite(endpoint.upMbps)) add(
    'PROXY_HYSTERIA2_BANDWIDTH_INVALID', 'bandwidth:invalid-up',
    `Hysteria2 endpoint "${endpoint.name}" has an invalid upload bandwidth.`,
  )
  if (endpoint.downMbps !== undefined && !positiveFinite(endpoint.downMbps)) add(
    'PROXY_HYSTERIA2_BANDWIDTH_INVALID', 'bandwidth:invalid-down',
    `Hysteria2 endpoint "${endpoint.name}" has an invalid download bandwidth.`,
  )
}

function validateTransport(
  name: string,
  transport: ProxyTransportIR,
  add: (code: string, feature: string, message: string) => void,
) {
  if (!['tcp', 'ws', 'http', 'grpc', 'httpupgrade', 'xhttp'].includes(String(transport.kind))) add(
    'PROXY_TRANSPORT_KIND_UNSUPPORTED', `transport:${String(transport.kind)}`,
    `Proxy endpoint "${name}" has an unsupported transport kind.`,
  )
  if (transport.kind === 'http' && !['http', 'h2'].includes(String(transport.variant))) add(
    'PROXY_TRANSPORT_HTTP_VARIANT_INVALID', 'transport:http-variant',
    `Proxy endpoint "${name}" has an invalid HTTP transport variant.`,
  )
  if (transport.kind === 'ws' && transport.maxEarlyData !== undefined
    && (!Number.isInteger(transport.maxEarlyData) || transport.maxEarlyData < 0)) add(
    'PROXY_WS_EARLY_DATA_INVALID', 'ws-early-data:invalid',
    `Proxy endpoint "${name}" has invalid WebSocket early-data intent.`,
  )
}

function hasEnabledTlsIntent(tls: ProxyTlsIR) {
  return Boolean(tls.serverName || tls.disableSni || tls.allowInsecure || tls.alpn?.length || tls.fingerprint || tls.reality)
}

function validPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65_535
}

function invalidPortSelection(value: unknown) {
  if (!value || typeof value !== 'object') return true
  const selection = value as Record<string, unknown>
  if (selection.kind === 'single') return !validPort(selection.port as number)
  if (selection.kind !== 'range') return true
  return !validPort(selection.start as number) || !validPort(selection.end as number)
    || Number(selection.start) > Number(selection.end)
}

function positiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

function positiveFinite(value: number) {
  return Number.isFinite(value) && value > 0
}

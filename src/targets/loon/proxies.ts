import type { ProxyTlsIR, ProxyTransportIR, ResolvedProxyEndpointIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { loonIssue } from './errors'
import type { LoonParameter, LoonProxy, LoonQuotedLiteral } from './model'
import { isSafeLoonPolicyName } from './serializer'

/**
 * Only values shown in checked first-party Loon examples are accepted. The
 * historical pinned manual proves aes-128-gcm and chacha20; the current node
 * page additionally shows 2022-blake3-aes-128-gcm. SSR examples and other
 * clients are not capability evidence for the Loon Shadowsocks grammar.
 * Evidence: LoonManual commit 4311d0030fe3065d4664b403a32010f083b99273,
 * docs/cn/node.md#L43-L48; current first-party page retrieved 2026-08-24:
 * https://nsloon.app/docs/Node/.
 */
export const LOON_SHADOWSOCKS_CIPHERS = new Set([
  'aes-128-gcm',
  'chacha20',
  '2022-blake3-aes-128-gcm',
])

/**
 * VMess examples in the pinned manual directly show only aes-128-gcm.
 * Evidence: LoonManual commit 4311d0030fe3065d4664b403a32010f083b99273,
 * docs/cn/node.md#L72-L94.
 */
export const LOON_VMESS_SECURITY = new Set(['aes-128-gcm'])
const SIMPLE_OBFS_NAMES = new Set(['simple-obfs'])

function quoted(value: string, grammar?: LoonQuotedLiteral['grammar']): LoonQuotedLiteral {
  return grammar ? { kind: 'quoted', value, grammar } : { kind: 'quoted', value }
}

export function checkLoonProxy(endpoint: ResolvedProxyEndpointIR, sourceId = endpoint.id): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = []
  const add = (code: string, message: string, feature = 'proxy') => issues.push(loonIssue(code, 'error', feature, message, sourceId))

  if (!isSafeServer(endpoint.server)) add(
    'LOON_PROXY_SERVER_INVALID', `Proxy "${endpoint.name}" has a server value that cannot be represented safely in a Loon profile.`,
  )
  if (!isSafeLoonPolicyName(endpoint.name)) add(
    'LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has a name that is unsafe in Loon's left-hand policy grammar.`, 'serialization',
  )

  const partial = endpoint.metadata?.compatibility
  const handledFeatures = endpoint.protocol === 'shadowsocks' && endpoint.plugin
    ? new Set([`plugin:${endpoint.plugin.name.trim().toLocaleLowerCase()}`])
    : new Set<string>()
  const unsupported = (partial?.unsupportedFeatures ?? []).filter((feature) => !handledFeatures.has(feature.trim().toLocaleLowerCase()))
  const unrecognized = partial?.unrecognizedParams ?? []
  const opaquePartial = partial?.status === 'partial' && !(partial.unsupportedFeatures?.length || partial.unrecognizedParams?.length)
  if (opaquePartial || unsupported.length || unrecognized.length) add(
    'LOON_PROXY_VARIANT_UNSUPPORTED',
    `Proxy "${endpoint.name}" contains endpoint semantics that the Loon compiler cannot prove lossless: ${[...unsupported, ...unrecognized].join(', ') || 'partial endpoint metadata'}.`,
    'proxy-variant',
  )

  switch (endpoint.protocol) {
    case 'http':
      checkHttp(endpoint, add)
      break
    case 'shadowsocks':
      checkShadowsocks(endpoint, add)
      break
    case 'trojan':
      checkTrojan(endpoint, add)
      break
    case 'vmess':
      checkVmess(endpoint, add)
      break
    case 'vless':
      checkVless(endpoint, add)
      break
    case 'hysteria2':
      checkHysteria2(endpoint, add)
      break
    case 'socks5':
    case 'tuic':
    case 'anytls':
      add('LOON_PROXY_PROTOCOL_UNSUPPORTED', `Proxy "${endpoint.name}" uses ${endpoint.protocol}, which is outside the proven Loon foundation protocol subset.`)
      break
    default: {
      // Runtime callers can still hand us a deserialized IR value that is
      // wider than the TypeScript union. Treat it as unsupported instead of
      // allowing an unregistered endpoint to become a dangling group member.
      const runtimeEndpoint = endpoint as unknown as { name?: unknown; protocol?: unknown }
      add('LOON_PROXY_PROTOCOL_UNSUPPORTED', `Proxy "${String(runtimeEndpoint.name)}" uses ${String(runtimeEndpoint.protocol)}, which is not recognized by the Loon compiler.`)
      break
    }
  }
  return issues
}

export function compileLoonProxy(endpoint: ResolvedProxyEndpointIR): LoonProxy | undefined {
  switch (endpoint.protocol) {
    case 'http': {
      const tls = endpoint.tls?.enabled === true
      return {
        name: endpoint.name,
        type: tls ? 'https' : 'http',
        arguments: [endpoint.server, endpoint.port, ...(endpoint.username !== undefined
          ? [endpoint.username.includes(',') ? quoted(endpoint.username, 'http-username') : endpoint.username, quoted(endpoint.password ?? '')]
          : [])],
        parameters: tls ? tlsParameters(endpoint.tls, false) : [],
      }
    }
    case 'shadowsocks': {
      const plugin = lowerSimpleObfs(endpoint.plugin)
      return {
        name: endpoint.name,
        type: 'Shadowsocks',
        arguments: [endpoint.server, endpoint.port, endpoint.method, quoted(endpoint.password)],
        parameters: [
          ...(plugin.parameters ?? []),
          // Universal's normalized endpoint contract treats Shadowsocks as
          // UDP-capable; fast-open has no corresponding IR intent and stays
          // omitted rather than being guessed.
          { key: 'udp', value: true },
        ],
      }
    }
    case 'trojan':
      return {
        name: endpoint.name,
        type: 'trojan',
        arguments: [endpoint.server, endpoint.port, quoted(endpoint.password)],
        parameters: [
          ...transportParameters(endpoint.transport),
          ...tlsParameters(endpoint.tls, true),
          { key: 'udp', value: true },
        ],
      }
    case 'vmess':
      return {
        name: endpoint.name,
        type: 'vmess',
        arguments: [endpoint.server, endpoint.port, endpoint.security, quoted(endpoint.uuid)],
        parameters: [
          { key: 'transport', value: endpoint.transport?.kind ?? 'tcp' },
          { key: 'alterId', value: endpoint.alterId! },
          ...transportParameters(endpoint.transport),
          { key: 'over-tls', value: endpoint.tls?.enabled === true },
          ...tlsParameters(endpoint.tls, false),
        ],
      }
    case 'vless':
      return {
        name: endpoint.name,
        type: 'VLESS',
        arguments: [endpoint.server, endpoint.port, quoted(endpoint.uuid)],
        parameters: [
          { key: 'transport', value: endpoint.transport?.kind ?? 'tcp' },
          ...transportParameters(endpoint.transport),
          { key: 'over-tls', value: endpoint.tls?.enabled === true },
          ...tlsParameters(endpoint.tls, false),
        ],
      }
    case 'hysteria2':
      return {
        name: endpoint.name,
        type: 'Hysteria2',
        arguments: [endpoint.server, endpoint.port, quoted(endpoint.password)],
        parameters: [
          ...tlsParameters(endpoint.tls, false),
          // Hysteria2 is likewise UDP-capable in the normalized IR contract;
          // its optional fast-open flag is not modeled.
          { key: 'udp', value: true },
        ],
      }
    case 'socks5':
    case 'tuic':
    case 'anytls':
      return undefined
    default:
      return undefined
  }
}

function checkHttp(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'http' }>,
  add: (code: string, message: string, feature?: string) => void,
) {
  const hasUser = endpoint.username !== undefined
  const hasPassword = endpoint.password !== undefined
  if (hasUser !== hasPassword || hasUser && (!endpoint.username || !endpoint.password)) add(
    'LOON_PROXY_AUTH_UNSUPPORTED', `Proxy "${endpoint.name}" must provide both non-empty HTTP credentials or neither.`, 'authentication',
  )
  if (endpoint.username !== undefined) {
    const usernameSafe = endpoint.username.includes(',')
      ? isSafeQuotedCredential(endpoint.username, true)
      : isSafeValue(endpoint.username)
    if (!usernameSafe) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an unsafe username value.`, 'serialization')
  }
  if (endpoint.password !== undefined && !isSafeQuotedCredential(endpoint.password)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an unsafe password value.`, 'serialization')
  checkTls(endpoint.name, endpoint.tls, add, endpoint.tls?.enabled === true ? 'https' : 'http', false)
}

function checkShadowsocks(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>,
  add: (code: string, message: string, feature?: string) => void,
) {
  if (!LOON_SHADOWSOCKS_CIPHERS.has(endpoint.method)) add(
    'LOON_PROXY_CIPHER_UNSUPPORTED', `Proxy "${endpoint.name}" uses Shadowsocks cipher "${endpoint.method}", which is outside Loon's audited cipher boundary.`, 'proxy-cipher',
  )
  if (!endpoint.password || !isSafeQuotedCredential(endpoint.password)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an empty or unsafe Shadowsocks password.`, 'serialization')
  const plugin = lowerSimpleObfs(endpoint.plugin)
  if (plugin.error) add('LOON_PROXY_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" ${plugin.error}`, 'proxy-variant')
}

function checkTrojan(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'trojan' }>,
  add: (code: string, message: string, feature?: string) => void,
) {
  if (endpoint.tls.enabled !== true) add('LOON_PROXY_TLS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" requires enabled TLS for Trojan.`, 'tls')
  if (!endpoint.password || !isSafeQuotedCredential(endpoint.password)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an empty or unsafe Trojan password.`, 'serialization')
  checkTls(endpoint.name, endpoint.tls, add, 'trojan', true)
  checkTransport(endpoint.name, endpoint.transport, add, ['tcp', 'ws', 'http'])
}

function checkVmess(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'vmess' }>,
  add: (code: string, message: string, feature?: string) => void,
) {
  if (endpoint.alterId === undefined || !Number.isInteger(endpoint.alterId) || endpoint.alterId < 0) add(
    'LOON_VMESS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" has no explicit valid alterId intent; the Loon default cannot be assumed losslessly.`, 'vmess',
  )
  if (!LOON_VMESS_SECURITY.has(endpoint.security)) add('LOON_PROXY_CIPHER_UNSUPPORTED', `Proxy "${endpoint.name}" uses VMess security "${endpoint.security}", which is outside the audited Loon subset.`, 'vmess')
  if (!isSafeValue(endpoint.uuid)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an unsafe VMess UUID.`, 'serialization')
  checkTransport(endpoint.name, endpoint.transport, add, ['tcp', 'ws', 'http'])
  checkTls(endpoint.name, endpoint.tls, add, 'vmess', false)
}

function checkVless(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'vless' }>,
  add: (code: string, message: string, feature?: string) => void,
) {
  if (endpoint.tls?.reality || endpoint.security === 'reality' || endpoint.flow) add(
    'LOON_VLESS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" carries Reality, Vision, or flow intent that Loon documents but this Universal-to-Loon mapping has not yet audited losslessly.`, 'vless',
  )
  if (endpoint.encryption !== undefined && endpoint.encryption !== 'none') add('LOON_VLESS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" uses unsupported VLESS encryption intent.`, 'vless')
  if (endpoint.security === 'tls' && endpoint.tls?.enabled !== true) add('LOON_VLESS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" declares VLESS TLS security without enabled TLS.`, 'vless')
  if (endpoint.security === 'none' && endpoint.tls?.enabled === true) add('LOON_VLESS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" declares security=none with enabled TLS.`, 'vless')
  if (!isSafeValue(endpoint.uuid)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an unsafe VLESS UUID.`, 'serialization')
  checkTransport(endpoint.name, endpoint.transport, add, ['tcp', 'ws', 'http'])
  checkTls(endpoint.name, endpoint.tls, add, 'vless', false)
}

function checkHysteria2(
  endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'hysteria2' }>,
  add: (code: string, message: string, feature?: string) => void,
) {
  if (endpoint.tls.enabled !== true) add('LOON_PROXY_TLS_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" requires enabled TLS for Hysteria2.`, 'tls')
  if (!endpoint.password || !isSafeQuotedCredential(endpoint.password)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${endpoint.name}" has an empty or unsafe Hysteria2 password.`, 'serialization')
  checkTls(endpoint.name, endpoint.tls, add, 'hysteria2', false)
  if (endpoint.obfs || endpoint.upMbps !== undefined || endpoint.downMbps !== undefined || endpoint.serverPorts?.length || endpoint.hopInterval) add(
    'LOON_HYSTERIA2_VARIANT_UNSUPPORTED', `Proxy "${endpoint.name}" uses Hysteria2 obfuscation, bandwidth, or port-hopping fields outside the proven Loon node subset.`, 'hysteria2',
  )
}

function checkTls(
  name: string,
  tls: ProxyTlsIR | undefined,
  add: (code: string, message: string, feature?: string) => void,
  feature: string,
  allowAlpn: boolean,
) {
  if (!tls) return
  if (!Array.isArray(tls.alpn) && tls.alpn !== undefined) add(
    'LOON_PROXY_TLS_VARIANT_UNSUPPORTED', `Proxy "${name}" has malformed ALPN metadata; Loon requires an explicit string-list shape.`, feature,
  )
  const rawAlpn = Array.isArray(tls.alpn) ? tls.alpn : undefined
  if (rawAlpn?.some((value) => typeof value !== 'string')) add(
    'LOON_PROXY_TLS_VARIANT_UNSUPPORTED', `Proxy "${name}" has a non-string ALPN token.`, feature,
  )
  const alpn = rawAlpn?.filter((value): value is string => typeof value === 'string')
  if (tls.enabled !== true && (tls.serverName || tls.allowInsecure || tls.alpn?.length || tls.disableSni || tls.fingerprint || tls.reality)) add(
    'LOON_PROXY_TLS_VARIANT_UNSUPPORTED', `Proxy "${name}" has TLS-only fields while TLS is disabled.`, feature,
  )
  if (tls.fingerprint || tls.reality || tls.disableSni) add(
    'LOON_PROXY_TLS_VARIANT_UNSUPPORTED', `Proxy "${name}" has TLS fingerprint, Reality, or disable-SNI intent that this audited ProxyFlow mapping does not express losslessly.`, feature,
  )
  if (alpn?.length && (!allowAlpn || alpn.length !== 1)) add(
    'LOON_PROXY_TLS_VARIANT_UNSUPPORTED',
    allowAlpn
      ? `Proxy "${name}" has multiple ALPN values, while the audited Loon syntax proves only one alpn token.`
      : `Proxy "${name}" has ALPN intent outside the audited syntax for this protocol variant.`,
    feature,
  )
  if (alpn?.some((value) => !isSafeValue(value) || value.includes(','))) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an unsafe ALPN token.`, 'serialization')
  if (tls.serverName !== undefined && !isSafeServer(tls.serverName)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an unsafe TLS server name.`, 'serialization')
}

function checkTransport(
  name: string,
  transport: ProxyTransportIR | undefined,
  add: (code: string, message: string, feature?: string) => void,
  allowed: Array<'tcp' | 'ws' | 'http'>,
) {
  if (!transport || transport.kind === 'tcp') return
  if (!allowed.includes(transport.kind as 'tcp' | 'ws' | 'http')) {
    add('LOON_PROXY_TRANSPORT_UNSUPPORTED', `Proxy "${name}" uses ${transport.kind} transport, which is outside the proven Loon transport subset.`, 'transport')
    return
  }
  if (transport.kind === 'http' && transport.variant !== 'http') add('LOON_PROXY_TRANSPORT_UNSUPPORTED', `Proxy "${name}" uses HTTP/2 transport metadata that Loon does not prove, rather than plain HTTP transport.`, 'transport')
  if (transport.kind === 'ws' && (transport.maxEarlyData !== undefined || transport.earlyDataHeaderName !== undefined)) add('LOON_PROXY_TRANSPORT_UNSUPPORTED', `Proxy "${name}" uses WebSocket early-data metadata that Loon does not expose in the audited syntax.`, 'transport')
  if (transport.kind === 'ws' || transport.kind === 'http') {
    for (const value of [transport.path, transport.host]) if (value !== undefined && !isSafeValue(value)) add('LOON_SERIALIZER_UNSAFE_VALUE', `Proxy "${name}" has an unsafe transport value.`, 'serialization')
  }
}

function transportParameters(transport?: ProxyTransportIR): LoonParameter[] {
  if (!transport || transport.kind === 'tcp') return []
  if (transport.kind === 'ws' || transport.kind === 'http') return [
    ...(transport.path !== undefined ? [{ key: 'path', value: transport.path }] : []),
    ...(transport.host !== undefined ? [{ key: 'host', value: transport.host }] : []),
  ]
  return []
}

function tlsParameters(tls?: ProxyTlsIR, allowAlpn = false): LoonParameter[] {
  if (!tls?.enabled) return []
  return [
    ...(tls.allowInsecure ? [{ key: 'skip-cert-verify', value: true }] : []),
    ...(tls.serverName ? [{ key: 'tls-name', value: tls.serverName }] : []),
    ...(allowAlpn && tls.alpn?.length === 1 ? [{ key: 'alpn', value: tls.alpn[0] }] : []),
  ]
}

function lowerSimpleObfs(plugin: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>['plugin']): { parameters?: LoonParameter[]; error?: string } {
  if (!plugin) return {}
  const name = plugin.name.trim().toLocaleLowerCase()
  if (!SIMPLE_OBFS_NAMES.has(name)) return { error: `uses Shadowsocks plugin "${plugin.name}", which has no proven Loon mapping.` }
  const entries: Array<[string, string | number | boolean]> = []
  if (typeof plugin.options === 'string') {
    for (const token of plugin.options.split(';')) {
      if (!token) continue
      const separator = token.indexOf('=')
      if (separator <= 0) return { error: `uses simple-obfs option "${token}" that is not a key=value pair.` }
      entries.push([token.slice(0, separator).trim(), token.slice(separator + 1)])
    }
  } else if (plugin.options) entries.push(...Object.entries(plugin.options))
  let mode: string | undefined
  let modeKey: 'obfs' | 'obfs-name' | undefined
  let host: string | undefined
  let uri: string | undefined
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().toLocaleLowerCase()
    // SIP003/simple-obfs source semantics call the mode `obfs`; Loon's
    // target syntax calls the same semantic field `obfs-name`. This is a
    // target-owned lowering, not an alias accepted in the Universal IR.
    const field = key === 'obfs' ? 'mode'
      : key === 'obfs-name' ? 'mode'
      : key === 'obfs-host' ? 'host'
        : key === 'obfs-uri' ? 'uri' : undefined
    if (!field || typeof rawValue !== 'string' || !rawValue) return { error: `uses simple-obfs option "${rawKey}" that cannot be mapped losslessly.` }
    if (field === 'mode') {
      const normalizedMode = rawValue.toLocaleLowerCase()
      if (mode !== undefined) {
        if (modeKey === key) return { error: `contains duplicate ${key} obfuscation mode intent.` }
        if (mode !== normalizedMode) return { error: 'contains conflicting obfs and obfs-name mode intent.' }
      } else {
        mode = normalizedMode
        modeKey = key as 'obfs' | 'obfs-name'
      }
    }
    if (field === 'host') { if (host !== undefined) return { error: 'contains duplicate obfs-host intent.' }; host = rawValue }
    if (field === 'uri') { if (uri !== undefined) return { error: 'contains duplicate obfs-uri intent.' }; uri = rawValue }
  }
  if (mode !== 'http' && mode !== 'tls') return { error: 'does not contain an explicit http or tls obfs-name.' }
  if (host !== undefined && !isSafeServer(host)) return { error: 'contains an unsafe obfs-host.' }
  if (uri !== undefined && (!uri.startsWith('/') || !isSafeValue(uri))) return { error: 'contains an unsafe obfs-uri.' }
  return { parameters: [
    { key: 'obfs-name', value: mode },
    ...(host !== undefined ? [{ key: 'obfs-host', value: host }] : []),
    ...(uri !== undefined ? [{ key: 'obfs-uri', value: uri }] : []),
  ] }
}

function isSafeValue(value: string) {
  return Boolean(value)
    && /^[\x20-\x7e]+$/.test(value)
    && value === value.trim()
    && !/[,="\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

/** Fixed quoted credentials may contain `=` as shown by the SS2022 example. */
function isSafeQuotedCredential(value: string, allowComma = false) {
  return Boolean(value)
    && /^[\x20-\x7e]+$/.test(value)
    && value === value.trim()
    && (allowComma || !value.includes(','))
    && !/["\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

function isSafeServer(value: string) {
  return isSafeValue(value) && !/\s/.test(value)
}

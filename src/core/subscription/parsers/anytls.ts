import { subscriptionIssue } from '../errors'
import {
  booleanValue, conflictingParamGroups, duplicateParamNames, finalizeEndpoint, safeDecode, unsupportedNode, validPort,
  type ParsedProtocolResult, type ProtocolParseContext,
} from '../utils'

const KNOWN_PARAMS = new Set([
  'sni', 'insecure', 'fp', 'client-fingerprint', 'alpn',
  'idle-session-check-interval', 'idle-session-timeout', 'min-idle-session',
])
const CRITICAL_UNSUPPORTED_PARAMS = new Set([
  'security', 'flow', 'type', 'network', 'transport', 'reality', 'pbk', 'sid', 'ech', 'pinsha256',
  'certificate-fingerprint', 'fingerprint', 'disable-sni', 'disable_sni', 'servername', 'server-name',
  'allow_insecure', 'allow-insecure', 'skip-cert-verify', 'udp', 'client-metadata',
])
const CRITICAL_PARAM_GROUPS = [
  { feature: 'sni', names: ['sni'] },
  { feature: 'allow-insecure', names: ['insecure'], caseInsensitive: true },
  { feature: 'client-fingerprint', names: ['fp', 'client-fingerprint'], caseInsensitive: true },
  { feature: 'alpn', names: ['alpn'] },
  { feature: 'idle-session-check-interval', names: ['idle-session-check-interval'] },
  { feature: 'idle-session-timeout', names: ['idle-session-timeout'] },
  { feature: 'min-idle-session', names: ['min-idle-session'] },
]

export function parseAnyTlsLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const url = new URL(input)
    const password = safeDecode(url.username)
    const port = url.port ? validPort(url.port) : 443
    if (url.protocol !== 'anytls:' || !url.hostname || !password || url.password || !port) throw new Error('invalid endpoint')
    const name = safeDecode(url.hash.slice(1)) || `AnyTLS ${url.hostname}`
    const params = url.searchParams
    const issues = []
    const unsupportedFeatures: string[] = []
    const duplicateParams = duplicateParamNames(params)
    const conflictingParams = conflictingParamGroups(params, CRITICAL_PARAM_GROUPS)
    unsupportedFeatures.push(...conflictingParams.map((feature) => `conflicting-param:${feature}`))

    const insecureValue = params.get('insecure')
    const allowInsecure = booleanValue(insecureValue)
    if (insecureValue !== null && allowInsecure === undefined) unsupportedFeatures.push('tls:invalid-allow-insecure')
    const sniValue = params.get('sni')
    if (sniValue !== null && !sniValue.trim()) unsupportedFeatures.push('tls:invalid-server-name')
    const alpnValue = params.get('alpn')
    const alpn = alpnValue?.split(',').map((value) => value.trim()).filter(Boolean)
    if (alpnValue !== null && !alpn?.length) unsupportedFeatures.push('tls:invalid-alpn')
    const fingerprint = params.get('fp') ?? params.get('client-fingerprint') ?? undefined
    if (fingerprint !== undefined && !fingerprint.trim()) unsupportedFeatures.push('tls:invalid-client-fingerprint')

    const idleSessionCheckIntervalSeconds = positiveInteger(params.get('idle-session-check-interval'))
    const idleSessionTimeoutSeconds = positiveInteger(params.get('idle-session-timeout'))
    const minIdleSession = nonNegativeInteger(params.get('min-idle-session'))
    if (params.has('idle-session-check-interval') && idleSessionCheckIntervalSeconds === undefined) unsupportedFeatures.push('anytls:invalid-idle-session-check-interval')
    if (params.has('idle-session-timeout') && idleSessionTimeoutSeconds === undefined) unsupportedFeatures.push('anytls:invalid-idle-session-timeout')
    if (params.has('min-idle-session') && minIdleSession === undefined) unsupportedFeatures.push('anytls:invalid-min-idle-session')

    const unknownParams = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key.toLocaleLowerCase()) && !CRITICAL_UNSUPPORTED_PARAMS.has(key.toLocaleLowerCase())))].sort()
    const unsupportedSecurityParams = [...new Set([...params.keys()].filter((key) => {
      const normalized = key.toLocaleLowerCase()
      return CRITICAL_UNSUPPORTED_PARAMS.has(normalized) || KNOWN_PARAMS.has(normalized) && key !== normalized
    }))].sort()
    unsupportedFeatures.push(...unsupportedSecurityParams.map((key) => `security:${key}`))

    if (duplicateParams.length) issues.push(subscriptionIssue('DUPLICATE_QUERY_PARAM', 'warning', `AnyTLS endpoint contains duplicate parameters: ${duplicateParams.join(', ')}.`, { nodeName: name, line: context.line }))
    if (conflictingParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_CONFLICT', 'warning', 'AnyTLS endpoint contains conflicting connection-critical parameters.', { nodeName: name, line: context.line }))
    if (unknownParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `AnyTLS endpoint contains unrecognized parameters: ${unknownParams.join(', ')}.`, { nodeName: name, line: context.line }))
    if (unsupportedSecurityParams.length) issues.push(subscriptionIssue('PROXY_ANYTLS_CRITICAL_PARAMETER_UNSUPPORTED', 'warning', 'AnyTLS endpoint contains unsupported connection-critical semantics and was blocked.', { nodeName: name, line: context.line }))
    if (unsupportedFeatures.some((feature) => feature.startsWith('anytls:invalid-'))) issues.push(subscriptionIssue('PROXY_ANYTLS_IDLE_SESSION_INVALID', 'warning', 'AnyTLS endpoint contains invalid idle-session settings.', { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', 'AnyTLS endpoint contains semantics that cannot be lowered reliably.', { nodeName: name, line: context.line }))

    return finalizeEndpoint({
      kind: 'anytls', protocol: 'anytls', name, server: url.hostname, port, password,
      tls: {
        enabled: true,
        serverName: sniValue?.trim() || url.hostname,
        ...(allowInsecure === true ? { allowInsecure: true } : {}),
        ...(alpn?.length ? { alpn } : {}),
        ...(fingerprint?.trim() ? { fingerprint: fingerprint.trim().toLocaleLowerCase() } : {}),
      },
      ...(idleSessionCheckIntervalSeconds !== undefined ? { idleSessionCheckIntervalSeconds } : {}),
      ...(idleSessionTimeoutSeconds !== undefined ? { idleSessionTimeoutSeconds } : {}),
      ...(minIdleSession !== undefined ? { minIdleSession } : {}),
    }, context, issues, unsupportedFeatures.length ? { status: 'partial', unsupportedFeatures } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'AnyTLS endpoint is missing a valid password, server, or port.', { line: context.line })
    return unsupportedNode('anytls', 'Malformed AnyTLS node', context, issue)
  }
}

function positiveInteger(value: string | null) {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

function nonNegativeInteger(value: string | null) {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined
}

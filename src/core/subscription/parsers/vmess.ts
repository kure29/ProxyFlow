import { decodeBase64Text } from '../base64'
import { subscriptionIssue } from '../errors'
import { finalizeEndpoint, isValidUuid, stringValue, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

const KNOWN_FIELDS = new Set(['v', 'ps', 'add', 'port', 'id', 'aid', 'scy', 'security', 'tls', 'sni', 'host', 'path', 'net', 'type', 'alpn', 'fp'])

export function parseVmessLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  const decoded = decodeBase64Text(input.slice(input.indexOf('://') + 3))
  try {
    if (!decoded) throw new Error('invalid base64')
    const value = JSON.parse(decoded) as Record<string, unknown>
    const server = stringValue(value.add)
    const port = validPort(value.port)
    const uuid = stringValue(value.id)
    if (!server || !port || !uuid || !isValidUuid(uuid)) throw new Error('invalid endpoint')
    const name = stringValue(value.ps) ?? `VMess ${server}`
    const issues = []
    const unsupportedFeatures: string[] = []
    const unknownFields = Object.keys(value).filter((key) => !KNOWN_FIELDS.has(key)).sort()
    const networkValue = stringValue(value.net)
    const network = (networkValue ?? 'tcp').toLocaleLowerCase()
    if (Object.hasOwn(value, 'net') && value.net !== '' && !networkValue) unsupportedFeatures.push('transport:invalid-value')
    const transport = parseVmessTransport(network, value)
    if (!transport) unsupportedFeatures.push(`transport:${network}`)
    const tlsIntent = parseVmessTls(value.tls)
    if (tlsIntent.invalid) {
      unsupportedFeatures.push('tls:invalid-value')
      issues.push(subscriptionIssue('PROXY_VMESS_TLS_UNSUPPORTED', 'warning', 'VMess 节点包含未知 tls 值，已阻止按明文连接语义编译。', { nodeName: name, line: context.line }))
    }
    const alterId = parseAlterId(value.aid)
    if (Object.hasOwn(value, 'aid') && alterId === undefined) {
      unsupportedFeatures.push('alter-id:invalid')
      issues.push(subscriptionIssue('PROXY_VMESS_ALTER_ID_INVALID', 'warning', 'VMess 节点包含非法 aid，未静默丢弃。', { nodeName: name, line: context.line }))
    }
    const headerTypeValue = stringValue(value.type)
    const headerType = headerTypeValue?.toLocaleLowerCase()
    if (headerType && headerType !== 'none') {
      unsupportedFeatures.push(`tcp-header:${headerType}`)
      issues.push(subscriptionIssue('PROXY_VMESS_TCP_HEADER_UNSUPPORTED', 'warning', 'VMess 节点包含无法无损表达的 TCP header type。', { nodeName: name, line: context.line }))
    }
    if (Object.hasOwn(value, 'type') && value.type !== '' && !headerTypeValue) unsupportedFeatures.push('tcp-header:invalid')
    for (const field of ['host', 'path'] as const) {
      if (Object.hasOwn(value, field) && value[field] !== '' && !stringValue(value[field])) unsupportedFeatures.push(`transport:invalid-${field}`)
    }
    const primarySecurity = stringValue(value.scy)
    const aliasSecurity = stringValue(value.security)
    if (Object.hasOwn(value, 'scy') && value.scy !== '' && !primarySecurity
      || Object.hasOwn(value, 'security') && value.security !== '' && !aliasSecurity) unsupportedFeatures.push('security:invalid-value')
    if (primarySecurity && aliasSecurity && primarySecurity.toLocaleLowerCase() !== aliasSecurity.toLocaleLowerCase()) {
      unsupportedFeatures.push('conflicting-field:security')
      issues.push(subscriptionIssue('PROXY_PARAMS_CONFLICT', 'warning', 'VMess 节点包含冲突的 security/scy 字段。', { nodeName: name, line: context.line }))
    }
    const alpnValue = stringValue(value.alpn)
    const alpn = alpnValue?.split(',').map((item) => item.trim()).filter(Boolean)
    if (Object.hasOwn(value, 'alpn') && value.alpn !== '' && (!alpnValue || !alpn?.length)) {
      unsupportedFeatures.push('tls:invalid-alpn')
      issues.push(subscriptionIssue('PROXY_TLS_ALPN_INVALID', 'warning', 'VMess 节点包含非法 ALPN，未静默删除。', { nodeName: name, line: context.line }))
    }
    const serverName = stringValue(value.sni)
    if (Object.hasOwn(value, 'sni') && value.sni !== '' && !serverName) unsupportedFeatures.push('tls:invalid-server-name')
    const fingerprint = stringValue(value.fp)
    if (Object.hasOwn(value, 'fp') && value.fp !== '' && !fingerprint) unsupportedFeatures.push('tls:invalid-fingerprint')
    if (unknownFields.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `VMess 节点包含未识别字段：${unknownFields.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `VMess 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    const tlsIntentPresent = tlsIntent.enabled || Boolean(serverName) || Boolean(alpn?.length) || Boolean(fingerprint)
    return finalizeEndpoint({
      kind: 'vmess', protocol: 'vmess', name, server, port, uuid,
      security: primarySecurity ?? aliasSecurity ?? 'auto',
      ...(alterId !== undefined ? { alterId } : {}),
      ...(tlsIntentPresent ? { tls: {
        enabled: tlsIntent.enabled,
        ...(serverName ? { serverName } : {}),
        ...(alpn?.length ? { alpn } : {}),
        ...(fingerprint ? { fingerprint } : {}),
      } } : {}),
      ...(transport ? { transport } : {}),
    }, context, issues, unsupportedFeatures.length ? {
      status: 'partial', unsupportedFeatures,
      ...(unknownFields.length ? { unrecognizedParams: unknownFields } : {}),
    } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'VMess 节点不是有效的 Base64 JSON，或缺少 UUID、server、port。', { line: context.line })
    return unsupportedNode('vmess', 'Malformed VMess node', context, issue)
  }
}

function parseVmessTransport(network: string, value: Record<string, unknown>) {
  if (network === 'tcp') return { kind: 'tcp' as const }
  if (network === 'ws') return { kind: 'ws' as const, ...(stringValue(value.path) ? { path: stringValue(value.path) } : {}), ...(stringValue(value.host) ? { host: stringValue(value.host) } : {}) }
  if (network === 'http' || network === 'h2') return { kind: 'http' as const, variant: network as 'http' | 'h2', ...(stringValue(value.path) ? { path: stringValue(value.path) } : {}), ...(stringValue(value.host) ? { host: stringValue(value.host) } : {}) }
  if (network === 'grpc') return { kind: 'grpc' as const, ...(stringValue(value.path) ? { serviceName: stringValue(value.path) } : {}) }
  return undefined
}

function parseAlterId(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined
}

function parseVmessTls(value: unknown) {
  if (value === 'tls' || value === true) return { enabled: true, invalid: false }
  if (value === undefined || value === null || value === '' || value === 'none' || value === false) return { enabled: false, invalid: false }
  return { enabled: false, invalid: true }
}

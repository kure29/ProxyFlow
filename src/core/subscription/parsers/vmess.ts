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
    const network = stringValue(value.net) ?? 'tcp'
    const transport = parseVmessTransport(network, value)
    if (!transport) unsupportedFeatures.push(`transport:${network}`)
    if (unknownFields.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `VMess 节点包含未识别字段：${unknownFields.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `VMess 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    const tlsEnabled = value.tls === 'tls' || value.tls === true
    const alpn = stringValue(value.alpn)?.split(',').map((item) => item.trim()).filter(Boolean)
    return finalizeEndpoint({
      kind: 'vmess', protocol: 'vmess', name, server, port, uuid,
      security: stringValue(value.scy) ?? stringValue(value.security) ?? 'auto',
      ...(validPortLikeInteger(value.aid) !== undefined ? { alterId: validPortLikeInteger(value.aid) } : {}),
      ...(tlsEnabled ? { tls: { enabled: true, ...(stringValue(value.sni) ? { serverName: stringValue(value.sni) } : {}), ...(alpn?.length ? { alpn } : {}) } } : {}),
      ...(transport ? { transport } : {}),
    }, context, issues, unsupportedFeatures.length || unknownFields.length ? {
      status: 'partial', unsupportedFeatures, unrecognizedParams: unknownFields,
    } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'VMess 节点不是有效的 Base64 JSON，或缺少 UUID、server、port。', { line: context.line })
    return unsupportedNode('vmess', 'Malformed VMess node', context, issue)
  }
}

function parseVmessTransport(network: string, value: Record<string, unknown>) {
  if (network === 'tcp') return { kind: 'tcp' as const }
  if (network === 'ws') return { kind: 'ws' as const, ...(stringValue(value.path) ? { path: stringValue(value.path) } : {}), ...(stringValue(value.host) ? { host: stringValue(value.host) } : {}) }
  if (network === 'http' || network === 'h2') return { kind: 'http' as const, ...(stringValue(value.path) ? { path: stringValue(value.path) } : {}), ...(stringValue(value.host) ? { host: stringValue(value.host) } : {}) }
  if (network === 'grpc') return { kind: 'grpc' as const, ...(stringValue(value.path) ? { serviceName: stringValue(value.path) } : {}) }
  return undefined
}

function validPortLikeInteger(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : undefined
}

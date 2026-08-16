import { subscriptionIssue } from '../errors'
import { booleanValue, conflictingParamGroups, duplicateParamNames, finalizeEndpoint, parseTransport, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

const KNOWN_PARAMS = new Set(['sni', 'servername', 'allowInsecure', 'insecure', 'security', 'type', 'network', 'path', 'host', 'serviceName', 'service-name', 'authority', 'alpn', 'fp', 'ed', 'eh', 'max-early-data', 'early-data-header-name'])
const CRITICAL_PARAM_GROUPS = [
  { feature: 'sni', names: ['sni', 'servername'] },
  { feature: 'security', names: ['security'], caseInsensitive: true },
  { feature: 'allow-insecure', names: ['allowInsecure', 'insecure'], caseInsensitive: true },
  { feature: 'alpn', names: ['alpn'] },
  { feature: 'client-fingerprint', names: ['fp'] },
  { feature: 'transport', names: ['type', 'network'], caseInsensitive: true },
  { feature: 'host', names: ['host'] },
  { feature: 'path', names: ['path'] },
  { feature: 'grpc-service-name', names: ['serviceName', 'service-name'] },
  { feature: 'ws-early-data', names: ['ed', 'max-early-data'] },
  { feature: 'ws-early-data-header', names: ['eh', 'early-data-header-name'] },
]

export function parseTrojanLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const url = new URL(input)
    const port = validPort(url.port)
    const password = safeDecode(url.username)
    if (!url.hostname || !port || !password) throw new Error('invalid endpoint')
    const name = safeDecode(url.hash.slice(1)) || `Trojan ${url.hostname}`
    const params = url.searchParams
    const issues = []
    const unsupportedFeatures: string[] = []
    const duplicateParams = duplicateParamNames(params)
    const conflictingParams = conflictingParamGroups(params, CRITICAL_PARAM_GROUPS)
    unsupportedFeatures.push(...conflictingParams.map((feature) => `conflicting-param:${feature}`))
    const unknownParams = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key)))].sort()
    const transport = parseTransport(params)
    if (transport.unsupported) unsupportedFeatures.push(transport.unsupported)
    if (transport.transport?.kind === 'xhttp') unsupportedFeatures.push('xhttp:requires-vless')
    const security = params.get('security')?.toLocaleLowerCase()
    if (security === 'reality') unsupportedFeatures.push('reality')
    else if (security && security !== 'tls') unsupportedFeatures.push(`security:${security}`)
    const insecureValue = params.get('allowInsecure') ?? params.get('insecure')
    const allowInsecure = booleanValue(insecureValue)
    if (insecureValue !== null && allowInsecure === undefined) unsupportedFeatures.push('tls:invalid-allow-insecure')
    if (params.get('authority')) unsupportedFeatures.push('grpc-authority')
    const alpnValue = params.get('alpn')
    const alpn = alpnValue?.split(',').map((item) => item.trim()).filter(Boolean)
    if (alpnValue !== null && !alpn?.length) unsupportedFeatures.push('tls:invalid-alpn')
    if (duplicateParams.length) issues.push(subscriptionIssue('DUPLICATE_QUERY_PARAM', 'warning', `Trojan 节点包含重复参数：${duplicateParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (conflictingParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_CONFLICT', 'warning', `Trojan 节点包含语义冲突的连接关键参数：${conflictingParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (transport.unsupported === 'ws-early-data:invalid') issues.push(subscriptionIssue('PROXY_WS_EARLY_DATA_INVALID', 'warning', 'Trojan 节点包含非法 WebSocket early-data 值，未静默丢弃。', { nodeName: name, line: context.line }))
    if (security && security !== 'tls') issues.push(subscriptionIssue('PROXY_SECURITY_UNSUPPORTED', 'warning', 'Trojan 节点包含无法可靠表达的 security 值。', { nodeName: name, line: context.line }))
    if (alpnValue !== null && !alpn?.length) issues.push(subscriptionIssue('PROXY_TLS_ALPN_INVALID', 'warning', 'Trojan 节点包含非法 ALPN，未静默删除。', { nodeName: name, line: context.line }))
    if (unknownParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `Trojan 节点包含未识别参数：${unknownParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `Trojan 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    return finalizeEndpoint({
      kind: 'trojan', protocol: 'trojan', name, server: url.hostname, port, password,
      tls: {
        enabled: true,
        ...(params.get('sni') || params.get('servername') ? { serverName: params.get('sni') ?? params.get('servername')! } : {}),
        ...(allowInsecure === true ? { allowInsecure: true } : {}),
        ...(alpn?.length ? { alpn } : {}),
        ...(params.get('fp') ? { fingerprint: params.get('fp')! } : {}),
      },
      ...(transport.transport ? { transport: transport.transport } : {}),
    }, context, issues, unsupportedFeatures.length ? {
      status: 'partial', unsupportedFeatures,
      ...(unknownParams.length ? { unrecognizedParams: unknownParams } : {}),
    } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'Trojan 节点缺少有效的 password、server 或 port。', { line: context.line })
    return unsupportedNode('trojan', 'Malformed Trojan node', context, issue)
  }
}

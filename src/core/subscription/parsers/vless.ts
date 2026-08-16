import { subscriptionIssue } from '../errors'
import { duplicateParamNames, finalizeEndpoint, isValidUuid, parseTransport, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

const KNOWN_PARAMS = new Set(['sni', 'servername', 'allowInsecure', 'insecure', 'security', 'tls', 'type', 'network', 'path', 'host', 'serviceName', 'service-name', 'alpn', 'flow', 'encryption', 'fp', 'pbk', 'sid', 'headerType'])

export function parseVlessLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const url = new URL(input)
    const port = validPort(url.port)
    const uuid = safeDecode(url.username)
    if (!url.hostname || !port || !isValidUuid(uuid)) throw new Error('invalid endpoint')
    const name = safeDecode(url.hash.slice(1)) || `VLESS ${url.hostname}`
    const params = url.searchParams
    const issues = []
    const unsupportedFeatures: string[] = []
    const duplicateParams = duplicateParamNames(params)
    const unknownParams = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key)))].sort()
    const transport = parseTransport(params)
    if (transport.unsupported) unsupportedFeatures.push(transport.unsupported)
    if (params.get('security') === 'reality' || params.has('pbk') || params.has('sid')) unsupportedFeatures.push('reality')
    if (params.get('flow')) unsupportedFeatures.push(`flow:${params.get('flow')}`)
    if (params.get('encryption') && params.get('encryption') !== 'none') unsupportedFeatures.push('vless-encryption')
    if (duplicateParams.length) issues.push(subscriptionIssue('DUPLICATE_QUERY_PARAM', 'warning', `VLESS 节点包含重复参数：${duplicateParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unknownParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `VLESS 节点包含未识别参数：${unknownParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `VLESS 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    const tlsEnabled = ['tls', 'reality'].includes(params.get('security') ?? '') || params.get('tls') === '1'
    const alpn = params.get('alpn')?.split(',').map((item) => item.trim()).filter(Boolean)
    return finalizeEndpoint({
      kind: 'vless', protocol: 'vless', name, server: url.hostname, port, uuid,
      ...(tlsEnabled ? { tls: {
        enabled: true,
        ...(params.get('sni') || params.get('servername') ? { serverName: params.get('sni') ?? params.get('servername')! } : {}),
        ...(params.get('allowInsecure') === '1' || params.get('insecure') === '1' ? { allowInsecure: true } : {}),
        ...(alpn?.length ? { alpn } : {}),
      } } : {}),
      ...(transport.transport ? { transport: transport.transport } : {}),
    }, context, issues, unsupportedFeatures.length || unknownParams.length || duplicateParams.length ? {
      status: 'partial', unsupportedFeatures, unrecognizedParams: unknownParams,
    } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'VLESS 节点缺少有效的 UUID、server 或 port。', { line: context.line })
    return unsupportedNode('vless', 'Malformed VLESS node', context, issue)
  }
}

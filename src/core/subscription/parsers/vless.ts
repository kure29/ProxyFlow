import { subscriptionIssue } from '../errors'
import { booleanValue, conflictingParamGroups, duplicateParamNames, finalizeEndpoint, isValidUuid, parseTransport, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

const KNOWN_PARAMS = new Set(['sni', 'servername', 'allowInsecure', 'insecure', 'security', 'tls', 'type', 'network', 'path', 'host', 'serviceName', 'service-name', 'authority', 'alpn', 'flow', 'encryption', 'fp', 'client-fingerprint', 'pbk', 'sid', 'headerType', 'ed', 'eh', 'max-early-data', 'early-data-header-name', 'mode'])
const CRITICAL_PARAM_GROUPS = [
  { feature: 'sni', names: ['sni', 'servername'] },
  { feature: 'security', names: ['security'], caseInsensitive: true },
  { feature: 'tls', names: ['tls'], caseInsensitive: true },
  { feature: 'allow-insecure', names: ['allowInsecure', 'insecure'], caseInsensitive: true },
  { feature: 'flow', names: ['flow'], caseInsensitive: true },
  { feature: 'encryption', names: ['encryption'], caseInsensitive: true },
  { feature: 'alpn', names: ['alpn'] },
  { feature: 'client-fingerprint', names: ['fp', 'client-fingerprint'] },
  { feature: 'reality-public-key', names: ['pbk'] },
  { feature: 'reality-short-id', names: ['sid'], caseInsensitive: true },
  { feature: 'transport', names: ['type', 'network'], caseInsensitive: true },
  { feature: 'host', names: ['host'] },
  { feature: 'path', names: ['path'] },
  { feature: 'grpc-service-name', names: ['serviceName', 'service-name'] },
  { feature: 'ws-early-data', names: ['ed', 'max-early-data'] },
  { feature: 'ws-early-data-header', names: ['eh', 'early-data-header-name'] },
  { feature: 'xhttp-mode', names: ['mode'], caseInsensitive: true },
  { feature: 'tcp-header', names: ['headerType'], caseInsensitive: true },
]

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
    const conflictingParams = conflictingParamGroups(params, CRITICAL_PARAM_GROUPS)
    unsupportedFeatures.push(...conflictingParams.map((feature) => `conflicting-param:${feature}`))
    const unknownParams = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key)))].sort()
    const transport = parseTransport(params)
    if (transport.unsupported) unsupportedFeatures.push(transport.unsupported)
    const securityValue = params.get('security')
    const security = securityValue?.trim().toLocaleLowerCase()
    const securitySupported = securityValue === null || security === 'none' || security === 'tls' || security === 'reality'
    if (!securitySupported) unsupportedFeatures.push(`security:${security || 'empty'}`)
    const realityRequested = security === 'reality' || params.has('pbk') || params.has('sid')
    const serverName = params.get('sni') ?? params.get('servername') ?? undefined
    const realityPublicKey = params.get('pbk') ?? undefined
    if (realityRequested && !realityPublicKey) unsupportedFeatures.push('reality:missing-public-key')
    else if (realityPublicKey && !/^[A-Za-z0-9_-]{43}$/.test(realityPublicKey)) unsupportedFeatures.push('reality:invalid-public-key')
    if (realityRequested && !serverName) unsupportedFeatures.push('reality:missing-server-name')
    const shortId = params.get('sid') ?? undefined
    if (shortId && (!/^[0-9a-f]+$/i.test(shortId) || shortId.length > 16 || shortId.length % 2 !== 0)) unsupportedFeatures.push('reality:invalid-short-id')
    const flow = params.get('flow')
    if (flow && flow !== 'none' && flow !== 'xtls-rprx-vision') unsupportedFeatures.push(`flow:${flow}`)
    const tlsValue = params.get('tls')
    const tlsFlag = booleanValue(tlsValue)
    if (tlsValue !== null && tlsFlag === undefined) unsupportedFeatures.push('tls:invalid-flag')
    if ((security === 'none' && tlsFlag === true) || ((security === 'tls' || security === 'reality') && tlsFlag === false)) unsupportedFeatures.push('tls:conflicting-security-flags')
    const insecureValue = params.get('allowInsecure') ?? params.get('insecure')
    const allowInsecure = booleanValue(insecureValue)
    if (insecureValue !== null && allowInsecure === undefined) unsupportedFeatures.push('tls:invalid-allow-insecure')
    if (params.get('authority')) unsupportedFeatures.push('grpc-authority')
    const encryption = params.get('encryption')?.trim().toLocaleLowerCase()
    if (encryption && encryption !== 'none') unsupportedFeatures.push(`encryption:${encryption}`)
    const headerType = params.get('headerType')?.trim().toLocaleLowerCase()
    if (headerType && headerType !== 'none') unsupportedFeatures.push(`tcp-header:${headerType}`)
    const alpnValue = params.get('alpn')
    const alpn = alpnValue?.split(',').map((item) => item.trim()).filter(Boolean)
    if (alpnValue !== null && !alpn?.length) unsupportedFeatures.push('tls:invalid-alpn')
    if (security === 'none' && realityRequested) unsupportedFeatures.push('reality:security-none')
    if (security === 'tls' && realityRequested) unsupportedFeatures.push('reality:security-tls')
    if (duplicateParams.length) issues.push(subscriptionIssue('DUPLICATE_QUERY_PARAM', 'warning', `VLESS 节点包含重复参数：${duplicateParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (conflictingParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_CONFLICT', 'warning', `VLESS 节点包含语义冲突的连接关键参数：${conflictingParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (!securitySupported) issues.push(subscriptionIssue('PROXY_SECURITY_UNSUPPORTED', 'warning', 'VLESS 节点包含未知 security 值，已阻止按明文连接语义编译。', { nodeName: name, line: context.line }))
    if ((security === 'none' || security === 'tls') && realityRequested) issues.push(subscriptionIssue('PROXY_VLESS_REALITY_SECURITY_CONFLICT', 'warning', 'VLESS 节点的显式 security 与 Reality 字段冲突，已阻止不安全编译。', { nodeName: name, line: context.line }))
    if (flow && flow !== 'none' && flow !== 'xtls-rprx-vision') issues.push(subscriptionIssue('PROXY_FLOW_UNSUPPORTED', 'warning', 'VLESS 节点包含未知 flow，已阻止不安全编译。', { nodeName: name, line: context.line }))
    if (alpnValue !== null && !alpn?.length) issues.push(subscriptionIssue('PROXY_TLS_ALPN_INVALID', 'warning', 'VLESS 节点包含非法 ALPN，未静默删除。', { nodeName: name, line: context.line }))
    if (transport.unsupported === 'ws-early-data:invalid') issues.push(subscriptionIssue('PROXY_WS_EARLY_DATA_INVALID', 'warning', 'VLESS 节点包含非法 WebSocket early-data 值，未静默丢弃。', { nodeName: name, line: context.line }))
    if (unknownParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `VLESS 节点包含未识别参数：${unknownParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `VLESS 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    const normalizedSecurity: 'none' | 'tls' | 'reality' | undefined = securitySupported
      ? (security ?? (realityRequested ? 'reality' : tlsFlag === true ? 'tls' : 'none')) as 'none' | 'tls' | 'reality'
      : undefined
    const tlsEnabled = normalizedSecurity === 'none'
      ? tlsFlag === true
      : normalizedSecurity === 'tls' || normalizedSecurity === 'reality'
        ? tlsFlag !== false
        : tlsFlag === true
    const fingerprint = params.get('fp') ?? params.get('client-fingerprint') ?? undefined
    const tlsIntentPresent = tlsEnabled || realityRequested || Boolean(serverName) || allowInsecure === true
      || Boolean(alpn?.length) || Boolean(fingerprint)
    return finalizeEndpoint({
      kind: 'vless', protocol: 'vless', name, server: url.hostname, port, uuid,
      ...(normalizedSecurity ? { security: normalizedSecurity } : {}),
      ...(encryption === 'none' ? { encryption: 'none' as const } : {}),
      ...(tlsIntentPresent ? { tls: {
        enabled: tlsEnabled,
        ...(serverName ? { serverName } : {}),
        ...(allowInsecure === true ? { allowInsecure: true } : {}),
        ...(alpn?.length ? { alpn } : {}),
        ...(fingerprint ? { fingerprint } : {}),
        ...(realityRequested && realityPublicKey ? { reality: { publicKey: realityPublicKey, ...(shortId ? { shortId } : {}) } } : {}),
      } } : {}),
      ...(flow === 'xtls-rprx-vision' ? { flow } : {}),
      ...(transport.transport ? { transport: transport.transport } : {}),
    }, context, issues, unsupportedFeatures.length ? {
      status: 'partial', unsupportedFeatures,
      ...(unknownParams.length ? { unrecognizedParams: unknownParams } : {}),
    } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'VLESS 节点缺少有效的 UUID、server 或 port。', { line: context.line })
    return unsupportedNode('vless', 'Malformed VLESS node', context, issue)
  }
}

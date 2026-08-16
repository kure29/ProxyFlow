import { subscriptionIssue } from '../errors'
import { booleanValue, conflictingParamGroups, duplicateParamNames, finalizeEndpoint, isValidUuid, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

const KNOWN_PARAMS = new Set(['sni', 'servername', 'insecure', 'allowInsecure', 'allow_insecure', 'disable_sni', 'disable-sni', 'alpn', 'congestion_control', 'congestion-controller', 'udp_relay_mode', 'udp-relay-mode'])
const CONGESTION_CONTROLS = new Set(['cubic', 'new_reno', 'bbr'])
const UDP_RELAY_MODES = new Set(['native', 'quic'])
const CRITICAL_PARAM_GROUPS = [
  { feature: 'sni', names: ['sni', 'servername'] },
  { feature: 'allow-insecure', names: ['insecure', 'allowInsecure', 'allow_insecure'], caseInsensitive: true },
  { feature: 'disable-sni', names: ['disable_sni', 'disable-sni'], caseInsensitive: true },
  { feature: 'alpn', names: ['alpn'] },
  { feature: 'congestion-control', names: ['congestion_control', 'congestion-controller'], caseInsensitive: true },
  { feature: 'udp-relay-mode', names: ['udp_relay_mode', 'udp-relay-mode'], caseInsensitive: true },
]

export function parseTuicLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const url = new URL(input)
    const port = validPort(url.port)
    const uuid = safeDecode(url.username)
    const password = safeDecode(url.password)
    if (!url.hostname || !port || !isValidUuid(uuid) || !password) throw new Error('invalid endpoint')
    const name = safeDecode(url.hash.slice(1)) || `TUIC ${url.hostname}`
    const params = url.searchParams
    const issues = []
    const unsupportedFeatures: string[] = []
    const unknownParams = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key)))].sort()
    const duplicateParams = duplicateParamNames(params)
    const conflictingParams = conflictingParamGroups(params, CRITICAL_PARAM_GROUPS)
    unsupportedFeatures.push(...conflictingParams.map((feature) => `conflicting-param:${feature}`))
    const congestionControl = (params.get('congestion_control') ?? params.get('congestion-controller'))?.toLocaleLowerCase()
    const udpRelayMode = (params.get('udp_relay_mode') ?? params.get('udp-relay-mode'))?.toLocaleLowerCase()
    const insecureValue = params.get('insecure') ?? params.get('allowInsecure') ?? params.get('allow_insecure')
    const allowInsecure = booleanValue(insecureValue)
    const disableSniValue = params.get('disable_sni') ?? params.get('disable-sni')
    const disableSni = booleanValue(disableSniValue)
    if (congestionControl && !CONGESTION_CONTROLS.has(congestionControl)) unsupportedFeatures.push(`congestion-control:${congestionControl}`)
    if (udpRelayMode && !UDP_RELAY_MODES.has(udpRelayMode)) unsupportedFeatures.push(`udp-relay-mode:${udpRelayMode}`)
    if (insecureValue !== null && allowInsecure === undefined) unsupportedFeatures.push('tls:invalid-allow-insecure')
    if (disableSniValue !== null && disableSni === undefined) unsupportedFeatures.push('tls:invalid-disable-sni')
    const alpnValue = params.get('alpn')
    const alpn = alpnValue?.split(',').map((item) => item.trim()).filter(Boolean)
    if (alpnValue !== null && !alpn?.length) unsupportedFeatures.push('tls:invalid-alpn')
    if (duplicateParams.length) issues.push(subscriptionIssue('DUPLICATE_QUERY_PARAM', 'warning', `TUIC 节点包含重复参数：${duplicateParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (conflictingParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_CONFLICT', 'warning', `TUIC 节点包含语义冲突的连接关键参数：${conflictingParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (alpnValue !== null && !alpn?.length) issues.push(subscriptionIssue('PROXY_TLS_ALPN_INVALID', 'warning', 'TUIC 节点包含非法 ALPN，未静默删除。', { nodeName: name, line: context.line }))
    if (unknownParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `TUIC 节点包含未识别参数：${unknownParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `TUIC 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    return finalizeEndpoint({
      kind: 'tuic', protocol: 'tuic', name, server: url.hostname, port, uuid, password,
      ...(congestionControl && CONGESTION_CONTROLS.has(congestionControl) ? { congestionControl: congestionControl as 'cubic' | 'new_reno' | 'bbr' } : {}),
      ...(udpRelayMode && UDP_RELAY_MODES.has(udpRelayMode) ? { udpRelayMode: udpRelayMode as 'native' | 'quic' } : {}),
      tls: {
        enabled: true,
        serverName: params.get('sni') ?? params.get('servername') ?? url.hostname,
        ...(allowInsecure === true ? { allowInsecure: true } : {}),
        ...(disableSni === true ? { disableSni: true } : {}),
        ...(alpn?.length ? { alpn } : {}),
      },
    }, context, issues, unsupportedFeatures.length ? { status: 'partial', unsupportedFeatures } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'TUIC v5 节点缺少有效的 UUID、password、server 或 port。', { line: context.line })
    return unsupportedNode('tuic', 'Malformed TUIC node', context, issue)
  }
}

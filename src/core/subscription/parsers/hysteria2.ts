import type { Hysteria2HopIntervalIR, Hysteria2PortIR } from '../../proxy'
import { subscriptionIssue } from '../errors'
import { booleanValue, conflictingParamGroups, duplicateParamNames, finalizeEndpoint, safeDecode, unsupportedNode, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

const KNOWN_PARAMS = new Set([
  'sni', 'peer', 'insecure', 'allowInsecure', 'alpn', 'obfs', 'obfs-password', 'obfsPassword',
  'up', 'down', 'upmbps', 'downmbps', 'mport', 'ports', 'hop-interval', 'hopInterval',
  'pinSHA256', 'ech',
])

const CRITICAL_PARAM_GROUPS = [
  { feature: 'sni', names: ['sni', 'peer'] },
  { feature: 'allow-insecure', names: ['insecure', 'allowInsecure'], caseInsensitive: true },
  { feature: 'alpn', names: ['alpn'] },
  { feature: 'obfs', names: ['obfs'], caseInsensitive: true },
  { feature: 'obfs-password', names: ['obfs-password', 'obfsPassword'] },
  { feature: 'port-hopping', names: ['mport', 'ports'] },
  { feature: 'hop-interval', names: ['hop-interval', 'hopInterval'] },
  { feature: 'up-bandwidth', names: ['up', 'upmbps'], caseInsensitive: true },
  { feature: 'down-bandwidth', names: ['down', 'downmbps'], caseInsensitive: true },
  { feature: 'pin-sha256', names: ['pinSHA256'] },
  { feature: 'ech', names: ['ech'] },
]

export function parseHysteria2Link(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const parsed = parseHysteria2Url(input)
    const { hostname, password, port, params } = parsed
    if (!hostname || !password) throw new Error('invalid endpoint')
    const name = safeDecode(parsed.hash.slice(1)) || `Hysteria2 ${hostname}`
    const issues = []
    const unsupportedFeatures: string[] = []
    const unknownParams = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key)))].sort()
    const duplicateParams = duplicateParamNames(params)
    const conflictingParams = conflictingParamGroups(params, CRITICAL_PARAM_GROUPS)
    unsupportedFeatures.push(...conflictingParams.map((feature) => `conflicting-param:${feature}`))

    const obfsType = params.get('obfs')?.toLocaleLowerCase()
    const obfsPassword = params.get('obfs-password') ?? params.get('obfsPassword') ?? undefined
    if (obfsType && obfsType !== 'salamander') unsupportedFeatures.push(`obfs:${obfsType}`)
    if (obfsType === 'salamander' && !obfsPassword) unsupportedFeatures.push('obfs:missing-password')

    const queryPortsValue = params.get('mport') ?? params.get('ports')
    const queryPorts = parseServerPorts(queryPortsValue)
    if (queryPortsValue !== null && !queryPorts) unsupportedFeatures.push('port-hopping:invalid-range')
    if (parsed.authorityPorts && queryPorts && !samePorts(parsed.authorityPorts, queryPorts)) unsupportedFeatures.push('port-hopping:conflicting-sources')
    const serverPorts = parsed.authorityPorts ?? queryPorts

    const hopIntervalValue = params.get('hop-interval') ?? params.get('hopInterval')
    const hopInterval = parseHopInterval(hopIntervalValue)
    if (hopIntervalValue !== null && !hopInterval) unsupportedFeatures.push('port-hopping:invalid-interval')

    const insecureValue = params.get('insecure') ?? params.get('allowInsecure')
    const allowInsecure = booleanValue(insecureValue)
    if (insecureValue !== null && allowInsecure === undefined) unsupportedFeatures.push('tls:invalid-allow-insecure')
    if (params.has('pinSHA256')) unsupportedFeatures.push('tls:pin-sha256')
    if (params.has('ech')) unsupportedFeatures.push('tls:ech')
    const upValue = params.get('upmbps') ?? params.get('up')
    const downValue = params.get('downmbps') ?? params.get('down')
    const upMbps = positiveNumber(upValue)
    const downMbps = positiveNumber(downValue)
    if (upValue !== null && upMbps === undefined) unsupportedFeatures.push('bandwidth:invalid-up')
    if (downValue !== null && downMbps === undefined) unsupportedFeatures.push('bandwidth:invalid-down')
    const alpnValue = params.get('alpn')
    const alpn = alpnValue?.split(',').map((item) => item.trim()).filter(Boolean)
    if (alpnValue !== null && !alpn?.length) unsupportedFeatures.push('tls:invalid-alpn')

    if (duplicateParams.length) issues.push(subscriptionIssue('DUPLICATE_QUERY_PARAM', 'warning', `Hysteria2 节点包含重复参数：${duplicateParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (conflictingParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_CONFLICT', 'warning', `Hysteria2 节点包含语义冲突的连接关键参数：${conflictingParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.some((feature) => feature.startsWith('bandwidth:'))) issues.push(subscriptionIssue('PROXY_HYSTERIA2_BANDWIDTH_INVALID', 'warning', 'Hysteria2 节点包含非法显式 bandwidth，未按未设置值继续。', { nodeName: name, line: context.line }))
    if (alpnValue !== null && !alpn?.length) issues.push(subscriptionIssue('PROXY_TLS_ALPN_INVALID', 'warning', 'Hysteria2 节点包含非法 ALPN，未静默删除。', { nodeName: name, line: context.line }))
    if (unknownParams.length) issues.push(subscriptionIssue('PROXY_PARAMS_UNRECOGNIZED', 'warning', `Hysteria2 节点包含未识别参数：${unknownParams.join(', ')}。`, { nodeName: name, line: context.line }))
    if (unsupportedFeatures.length) issues.push(subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `Hysteria2 节点包含当前不可靠支持的特性：${unsupportedFeatures.join(', ')}。`, { nodeName: name, line: context.line }))
    return finalizeEndpoint({
      kind: 'hysteria2', protocol: 'hysteria2', name, server: hostname, port, password,
      tls: {
        enabled: true,
        serverName: params.get('sni') ?? params.get('peer') ?? hostname,
        ...(allowInsecure === true ? { allowInsecure: true } : {}),
        ...(alpn?.length ? { alpn } : {}),
      },
      ...(obfsType === 'salamander' && obfsPassword ? { obfs: { type: 'salamander', password: obfsPassword } } : {}),
      ...(upMbps !== undefined ? { upMbps } : {}),
      ...(downMbps !== undefined ? { downMbps } : {}),
      ...(serverPorts ? { serverPorts } : {}),
      ...(hopInterval ? { hopInterval } : {}),
    }, context, issues, unsupportedFeatures.length ? { status: 'partial', unsupportedFeatures } : undefined)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'Hysteria2 节点缺少有效的 password、server 或 port。', { line: context.line })
    return unsupportedNode('hysteria2', 'Malformed Hysteria2 node', context, issue)
  }
}

function parseHysteria2Url(input: string) {
  const match = /^(?:hysteria2|hy2):\/\/([^/?#]*)(.*)$/i.exec(input.trim())
  if (!match) throw new Error('invalid scheme')
  const authority = match[1]
  const at = authority.lastIndexOf('@')
  if (at <= 0) throw new Error('missing credential')
  const password = safeDecode(authority.slice(0, at))
  const address = authority.slice(at + 1)
  const endpoint = parseAuthorityAddress(address)
  const rest = match[2]
  const suffix = rest.startsWith('/') ? rest : `/${rest}`
  const url = new URL(`https://${endpoint.urlHost}:${endpoint.port}${suffix}`)
  return { hostname: url.hostname.replace(/^\[|\]$/g, ''), password, port: endpoint.port, params: url.searchParams, hash: url.hash, authorityPorts: endpoint.serverPorts }
}

function parseAuthorityAddress(address: string) {
  let hostname: string
  let portSpec: string | undefined
  let urlHost: string
  if (address.startsWith('[')) {
    const close = address.indexOf(']')
    if (close < 2) throw new Error('invalid IPv6 address')
    hostname = address.slice(1, close)
    urlHost = `[${hostname}]`
    const remainder = address.slice(close + 1)
    if (remainder && !remainder.startsWith(':')) throw new Error('invalid authority')
    portSpec = remainder.slice(1) || undefined
  } else {
    const colon = address.lastIndexOf(':')
    hostname = colon < 0 ? address : address.slice(0, colon)
    urlHost = hostname
    portSpec = colon < 0 ? undefined : address.slice(colon + 1)
  }
  if (!hostname) throw new Error('missing host')
  const selections = portSpec === undefined ? [{ kind: 'single' as const, port: 443 }] : parseServerPorts(portSpec)
  if (!selections) throw new Error('invalid port selection')
  const first = selections[0]
  const port = first.kind === 'single' ? first.port : first.start
  const serverPorts = portSpec !== undefined && (selections.length > 1 || selections[0].kind === 'range') ? selections : undefined
  return { urlHost, port, serverPorts }
}

function positiveNumber(value: string | null) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function parseServerPorts(value: string | null): Hysteria2PortIR[] | undefined {
  if (!value) return undefined
  const values = value.split(',').map((item) => item.trim()).filter(Boolean)
  const ports = values.map(parseServerPort)
  return values.length > 0 && ports.every((item): item is Hysteria2PortIR => Boolean(item)) ? ports : undefined
}

function parseServerPort(value: string): Hysteria2PortIR | undefined {
  const single = /^(\d{1,5})$/.exec(value)
  if (single) {
    const port = Number(single[1])
    return port >= 1 && port <= 65_535 ? { kind: 'single', port } : undefined
  }
  const range = /^(\d{1,5})-(\d{1,5})$/.exec(value)
  if (!range) return undefined
  const start = Number(range[1])
  const end = Number(range[2])
  return start >= 1 && end <= 65_535 && start <= end ? { kind: 'range', start, end } : undefined
}

function parseHopInterval(value: string | null): Hysteria2HopIntervalIR | undefined {
  if (!value) return undefined
  const fixed = /^(\d+)$/.exec(value.trim())
  if (fixed) {
    const seconds = Number(fixed[1])
    return seconds > 0 ? { kind: 'fixed', seconds } : undefined
  }
  const range = /^(\d+)-(\d+)$/.exec(value.trim())
  if (!range) return undefined
  const minSeconds = Number(range[1])
  const maxSeconds = Number(range[2])
  return minSeconds > 0 && minSeconds <= maxSeconds ? { kind: 'range', minSeconds, maxSeconds } : undefined
}

function samePorts(left: Hysteria2PortIR[], right: Hysteria2PortIR[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

import { decodeBase64Text } from '../base64'
import { subscriptionIssue } from '../errors'
import { finalizeEndpoint, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'
import { isModeledShadowsocksMethod, isPortableShadowsocksPlugin } from '../../proxy'

export function parseShadowsocksLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  const raw = input.slice(input.indexOf('://') + 3)
  const hashIndex = raw.indexOf('#')
  const name = hashIndex >= 0 ? safeDecode(raw.slice(hashIndex + 1)) : 'Shadowsocks node'
  const withoutName = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  const queryIndex = withoutName.indexOf('?')
  const endpointPart = queryIndex >= 0 ? withoutName.slice(0, queryIndex) : withoutName
  const params = new URLSearchParams(queryIndex >= 0 ? withoutName.slice(queryIndex + 1) : '')
  const parsed = parseSip002(endpointPart) ?? parseLegacy(endpointPart)
  if (!parsed) {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'Shadowsocks 节点缺少有效的 method、password、server 或 port。', { line: context.line })
    return unsupportedNode('shadowsocks', name, context, issue)
  }
  if (!isModeledShadowsocksMethod(parsed.method)) {
    const issue = subscriptionIssue('PROXY_CIPHER_UNSUPPORTED', 'error', `Shadowsocks cipher “${parsed.method}” 尚未由 Universal IR 建模。`, { line: context.line })
    return unsupportedNode('shadowsocks', name, context, issue)
  }
  const pluginValue = params.get('plugin')
  const [pluginName, ...pluginOptions] = pluginValue ? safeDecode(pluginValue).split(';') : []
  const pluginIssue = pluginName && !isPortableShadowsocksPlugin(pluginName)
    ? subscriptionIssue('PROXY_VARIANT_PARTIAL', 'warning', `Shadowsocks plugin “${pluginName}” 无法在 Mihomo 与 sing-box 间可靠直译。`, { nodeName: name, line: context.line })
    : undefined
  return finalizeEndpoint({
    kind: 'shadowsocks', protocol: 'shadowsocks', name, ...parsed,
    ...(pluginName ? { plugin: { name: pluginName, ...(pluginOptions.length ? { options: pluginOptions.join(';') } : {}) } } : {}),
  }, context, pluginIssue ? [pluginIssue] : [], pluginIssue ? { status: 'partial', unsupportedFeatures: [`plugin:${pluginName}`] } : undefined)
}

function parseSip002(value: string) {
  const at = value.lastIndexOf('@')
  if (at < 0) return undefined
  const credentialsRaw = value.slice(0, at)
  const credentials = credentialsRaw.includes(':') ? safeDecode(credentialsRaw) : decodeBase64Text(credentialsRaw)
  const address = parseAddress(value.slice(at + 1))
  if (!credentials || !address) return undefined
  const separator = credentials.indexOf(':')
  if (separator <= 0) return undefined
  return { method: credentials.slice(0, separator), password: credentials.slice(separator + 1), ...address }
}

function parseLegacy(value: string) {
  const decoded = decodeBase64Text(value)
  if (!decoded) return undefined
  const at = decoded.lastIndexOf('@')
  if (at < 0) return undefined
  const separator = decoded.indexOf(':')
  if (separator <= 0 || separator > at) return undefined
  const address = parseAddress(decoded.slice(at + 1))
  return address ? { method: decoded.slice(0, separator), password: decoded.slice(separator + 1, at), ...address } : undefined
}

function parseAddress(value: string) {
  try {
    const url = new URL(`http://${value}`)
    const port = validPort(url.port)
    return url.hostname && port ? { server: url.hostname, port } : undefined
  } catch { return undefined }
}

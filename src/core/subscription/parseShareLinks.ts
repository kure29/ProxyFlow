import { stableOpaqueHash } from '../proxy'
import { subscriptionIssue } from './errors'
import { parseHttpLink, parseShadowsocksLink, parseSocksLink, parseTrojanLink, parseVlessLink, parseVmessLink } from './parsers'
import type { ParseSubscriptionOptions, ParsedSubscriptionNode, SubscriptionIssue } from './types'
import type { ParsedProtocolResult } from './utils'

const UNSUPPORTED_SCHEMES = new Set(['hysteria', 'hysteria2', 'hy2', 'tuic', 'wireguard', 'wg', 'shadowtls', 'anytls'])

export function parseShareLinks(input: string, options: ParseSubscriptionOptions) {
  const sourceId = options.sourceId
  const sourceName = options.sourceName ?? 'Subscription'
  const lines = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const nodes: ParsedSubscriptionNode[] = []
  const issues: SubscriptionIssue[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line || line.startsWith('#')) continue
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(line)?.[1].toLocaleLowerCase()
    const context = { sourceId, sourceName, line: index + 1 }
    let parsed: ParsedProtocolResult | undefined
    if (scheme === 'http' || scheme === 'https') parsed = parseHttpLink(line, context)
    else if (scheme === 'socks' || scheme === 'socks5') parsed = parseSocksLink(line, context)
    else if (scheme === 'ss') parsed = parseShadowsocksLink(line, context)
    else if (scheme === 'trojan') parsed = parseTrojanLink(line, context)
    else if (scheme === 'vmess') parsed = parseVmessLink(line, context)
    else if (scheme === 'vless') parsed = parseVlessLink(line, context)
    else {
      const code = scheme && UNSUPPORTED_SCHEMES.has(scheme) ? 'PROXY_PROTOCOL_UNSUPPORTED' : 'PROXY_LINK_UNRECOGNIZED'
      const name = safeFragmentName(line) ?? `Unsupported line ${index + 1}`
      const issue = subscriptionIssue(code, 'error', scheme
        ? `${name} 使用了 V0.5 不支持的协议 “${scheme}”。`
        : `第 ${index + 1} 行不是可识别的代理分享链接。`, { nodeName: name, line: index + 1 })
      parsed = {
        node: {
          id: `unsupported-${stableOpaqueHash(`${sourceId}\u0000${scheme ?? 'unknown'}\u0000${index + 1}`)}`,
          name, protocol: scheme ?? 'unknown', sourceId, sourceName, status: 'unsupported', issues: [issue],
        },
        issues: [issue],
      }
    }
    nodes.push(parsed.node)
    issues.push(...parsed.issues)
  }
  return { nodes, issues }
}

export function containsShareLinks(input: string) {
  return /(?:^|\n)\s*(?:https?|socks5?|ss|trojan|vmess|vless|hysteria2?|hy2|tuic|wireguard|shadowtls|anytls):\/\//im.test(input)
}

function safeFragmentName(line: string) {
  const hash = line.lastIndexOf('#')
  if (hash < 0) return undefined
  try { return decodeURIComponent(line.slice(hash + 1)).slice(0, 160) } catch { return line.slice(hash + 1, hash + 161) }
}

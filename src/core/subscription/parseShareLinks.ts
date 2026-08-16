import { stableOpaqueHash } from '../proxy'
import { subscriptionIssue } from './errors'
import { parseAnyTlsLink, parseHttpLink, parseHysteria2Link, parseShadowsocksLink, parseSocksLink, parseTrojanLink, parseTuicLink, parseVlessLink, parseVmessLink } from './parsers'
import type { ParseSubscriptionOptions, ParsedSubscriptionNode, SubscriptionIssue } from './types'
import type { ParsedProtocolResult } from './utils'

const UNSUPPORTED_SCHEMES = new Set([
  'hysteria', 'wireguard', 'wg', 'shadowtls', 'ssr', 'snell', 'mieru', 'ssh',
  'masque', 'tailscale', 'naive', 'juicity', 'socks4', 'socks4a',
])
const KNOWN_PROXY_SCHEMES = new Set([
  'http', 'https', 'socks', 'socks5', 'ss', 'ssr', 'trojan', 'vmess', 'vless',
  'hysteria', 'hysteria2', 'hy2', 'tuic', 'anytls', 'wireguard', 'wg', 'shadowtls',
  'snell', 'mieru', 'ssh', 'masque', 'tailscale', 'naive', 'juicity', 'socks4', 'socks4a',
])

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
    else if (scheme === 'hysteria2' || scheme === 'hy2') parsed = parseHysteria2Link(line, context)
    else if (scheme === 'tuic') parsed = parseTuicLink(line, context)
    else if (scheme === 'anytls') parsed = parseAnyTlsLink(line, context)
    else if (scheme === 'vmess') parsed = parseVmessLink(line, context)
    else if (scheme === 'vless') parsed = parseVlessLink(line, context)
    else {
      const code = scheme && UNSUPPORTED_SCHEMES.has(scheme) ? 'PROXY_PROTOCOL_UNSUPPORTED' : 'PROXY_LINK_UNRECOGNIZED'
      const name = safeFragmentName(line) ?? `Unsupported line ${index + 1}`
      const issue = subscriptionIssue(code, 'error', scheme
        ? `${name} 使用了 V0.6 不支持的协议 “${scheme}”。`
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
  return uriLines(input).some((line) => {
    const scheme = uriScheme(line)
    return Boolean(scheme && KNOWN_PROXY_SCHEMES.has(scheme) && isProxyUriCandidate(line, scheme))
  })
}

/**
 * Detects URI subscriptions independently of whether each protocol is supported.
 * A plain web URL is deliberately excluded unless it has proxy-like authority
 * (credentials or an explicit port); unknown schemes need a known proxy scheme or
 * a multi-line URI list to avoid treating arbitrary text as a subscription.
 */
export function looksLikeUriSubscription(input: string) {
  const lines = uriLines(input)
  if (!lines.length || lines.some((line) => !uriScheme(line))) return false
  const schemes = lines.map((line) => uriScheme(line)!)
  const proxyLines = lines.filter((line) => {
    const scheme = uriScheme(line)
    return Boolean(scheme && isProxyUriCandidate(line, scheme))
  })
  if (proxyLines.length !== lines.length) return false
  if (schemes.some((scheme) => KNOWN_PROXY_SCHEMES.has(scheme))) return true
  return lines.length >= 2
}

function uriLines(input: string) {
  return input.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function uriScheme(line: string) {
  return /^([a-z][a-z0-9+.-]*):\/\//i.exec(line)?.[1].toLocaleLowerCase()
}

function isProxyUriCandidate(line: string, scheme: string) {
  if (scheme !== 'http' && scheme !== 'https') return new RegExp(`^${scheme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\/\\/$`, 'i').test(line) || /^\S+:\/\/\S+$/.test(line)
  if (/^https?:\/\/$/i.test(line)) return true
  try {
    const url = new URL(line)
    if (!url.hostname) return false
    return Boolean(url.port || url.username || url.password)
  } catch {
    return false
  }
}

function safeFragmentName(line: string) {
  const hash = line.lastIndexOf('#')
  if (hash < 0) return undefined
  try { return decodeURIComponent(line.slice(hash + 1)).slice(0, 160) } catch { return line.slice(hash + 1, hash + 161) }
}

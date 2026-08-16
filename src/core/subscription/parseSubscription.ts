import { subscriptionIssue } from './errors'
import { detectSubscriptionFormat } from './detectFormat'
import { parseClashSubscription } from './parseClash'
import { parseProxyLineSubscription } from './parseProxyLines'
import { parseShareLinks } from './parseShareLinks'
import { parseStructuredSubscription } from './parseStructured'
import type { ParseSubscriptionOptions, ParsedSubscriptionNode, SubscriptionIssue, SubscriptionParseResult } from './types'

export const DEFAULT_MAX_SUBSCRIPTION_BYTES = 2 * 1024 * 1024
export const DEFAULT_MAX_SUBSCRIPTION_NODES = 5_000

export function parseSubscription(input: string, options: ParseSubscriptionOptions): SubscriptionParseResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SUBSCRIPTION_BYTES
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_SUBSCRIPTION_NODES
  if (new TextEncoder().encode(input).byteLength > maxBytes) return emptyResult('unsupported', [
    subscriptionIssue('SUBSCRIPTION_TOO_LARGE', 'error', `订阅内容超过 ${Math.round(maxBytes / 1024 / 1024)} MiB 安全限制。`),
  ])
  const detected = detectSubscriptionFormat(input, options)
  let nodes: ParsedSubscriptionNode[] = []
  let issues: SubscriptionIssue[] = []
  if (detected.format === 'clash-yaml') {
    const clash = parseClashSubscription(input, options)
    nodes = clash?.nodes ?? []
    issues = clash?.issues ?? []
    if (clash?.hasNonProxySections) issues.push(subscriptionIssue('ONLY_PROXY_SECTION_IMPORTED', 'info', '只导入了 Clash/Mihomo YAML 的 proxies 节；其它配置段已忽略。'))
  } else if (detected.format === 'share-links' || detected.format === 'base64') {
    const parsed = parseShareLinks(detected.decoded ?? input, options)
    nodes = parsed.nodes
    issues = parsed.issues
  } else if (detected.format === 'surge' || detected.format === 'surfboard' || detected.format === 'loon' || detected.format === 'quantumult-x') {
    const parsed = parseProxyLineSubscription(input, options, detected.format)
    nodes = parsed.nodes
    issues = parsed.issues
  } else if (detected.format === 'clash-json' || detected.format === 'sub-store-json' || detected.format === 'sing-box-json' || detected.format === 'v2ray-json' || detected.format === 'egern') {
    const parsed = parseStructuredSubscription(input, options, detected.format)
    nodes = parsed?.nodes ?? []
    issues = parsed?.issues ?? [subscriptionIssue('SUBSCRIPTION_PARSE_FAILED', 'error', 'The detected subscription document could not be parsed.')]
    if (parsed?.hasNonProxySections) issues.push(subscriptionIssue('ONLY_PROXY_SECTION_IMPORTED', 'info', 'Only proxy endpoint definitions were imported; client routing and control sections were ignored.'))
  } else {
    issues = [subscriptionIssue(input.trim() ? 'UNSUPPORTED_FORMAT' : 'PARSE_FAILED', 'error', input.trim()
      ? '无法识别订阅格式。支持 URI、Base64 URI、Clash/Mihomo、Egern、sing-box、V2Ray 与常见客户端代理行。'
      : '订阅内容为空。')]
  }
  if (nodes.length > maxNodes) return emptyResult(detected.format, [
    subscriptionIssue('SUBSCRIPTION_TOO_LARGE', 'error', `订阅包含超过 ${maxNodes} 个节点，已停止解析。`),
  ])
  nodes = ensureUniqueNodeIds(nodes)
  const proxies = nodes.flatMap((node) => node.endpoint ? [node.endpoint] : [])
  return summarize(detected.format, nodes, proxies, issues)
}

function ensureUniqueNodeIds(nodes: ParsedSubscriptionNode[]) {
  const occurrences = new Map<string, number>()
  return nodes.map((node) => {
    const occurrence = occurrences.get(node.id) ?? 0
    occurrences.set(node.id, occurrence + 1)
    if (occurrence === 0) return node
    const id = `${node.id}-${occurrence + 1}`
    return { ...node, id, ...(node.endpoint ? { endpoint: { ...node.endpoint, id } } : {}) }
  })
}

function summarize(format: SubscriptionParseResult['format'], nodes: ParsedSubscriptionNode[], proxies: SubscriptionParseResult['proxies'], issues: SubscriptionIssue[]): SubscriptionParseResult {
  return {
    format, nodes, proxies, issues,
    detectedCount: nodes.length,
    readyCount: nodes.filter((node) => node.status === 'ready').length,
    partialCount: nodes.filter((node) => node.status === 'partial').length,
    unsupportedCount: nodes.filter((node) => node.status === 'unsupported').length,
  }
}

function emptyResult(format: SubscriptionParseResult['format'], issues: SubscriptionIssue[]): SubscriptionParseResult {
  return summarize(format, [], [], issues)
}

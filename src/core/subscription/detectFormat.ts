import { decodeBase64Text } from './base64'
import { parseClashSubscription } from './parseClash'
import { detectProxyLineFormat } from './parseProxyLines'
import { containsShareLinks, looksLikeUriSubscription } from './parseShareLinks'
import { parseDocument } from 'yaml'
import type { ParseSubscriptionOptions, SubscriptionFormat } from './types'

export interface DetectedSubscriptionFormat {
  format: SubscriptionFormat
  decoded?: string
  label?: string
}

export function detectSubscriptionFormat(input: string, options: ParseSubscriptionOptions): DetectedSubscriptionFormat {
  if (containsShareLinks(input) || looksLikeUriSubscription(input)) return { format: 'share-links' }
  const decoded = decodeBase64Text(input)
  if (decoded && (containsShareLinks(decoded) || looksLikeUriSubscription(decoded))) return { format: 'base64', decoded }
  const lineFormat = detectProxyLineFormat(input)
  if (lineFormat) return { format: lineFormat }
  const structured = inspectStructured(input)
  if (structured) return structured
  const yaml = inspectYaml(input)
  if (yaml) return yaml
  if (parseClashSubscription(input, options)) return { format: 'clash-yaml' }
  return { format: 'unsupported' }
}

function inspectStructured(input: string): DetectedSubscriptionFormat | undefined {
  let value: unknown
  try {
    value = JSON.parse(input) as unknown
  } catch {
    return undefined
  }
  if (Array.isArray(value) && value.every(isRecord) && (value.length === 0 || value.some((item) => typeof item.type === 'string'))) {
    return { format: 'sub-store-json', label: 'Sub-Store JSON' }
  }
  if (!isRecord(value)) return undefined
  if (Array.isArray(value.outbounds)) {
    const outbounds = value.outbounds.filter(isRecord)
    const hasProtocol = outbounds.some((item) => typeof item.protocol === 'string')
    const hasType = outbounds.some((item) => typeof item.type === 'string')
    if (hasProtocol && !hasType) return { format: 'v2ray-json', label: 'V2Ray JSON' }
    if (hasType && !hasProtocol) return { format: 'sing-box-json', label: 'sing-box JSON' }
    if (hasProtocol && hasType) return undefined
  }
  if (Array.isArray(value.proxies)) {
    const types = value.proxies.filter(isRecord).map((item) => String(item.type ?? '').toLocaleLowerCase())
    if (types.some((type) => ['https', 'socks5_tls'].includes(type))) return { format: 'egern', label: 'Egern' }
    return { format: 'clash-json', label: 'Mihomo / Clash JSON' }
  }
  return undefined
}

function inspectYaml(input: string): DetectedSubscriptionFormat | undefined {
  try {
    const document = parseDocument(input, { schema: 'core' })
    if (document.errors.length) return undefined
    const value = document.toJS({ maxAliasCount: 32 })
    if (!isRecord(value) || !Array.isArray(value.proxies)) return undefined
    const records = value.proxies.filter(isRecord)
    const types = records.map((item) => String(item.type ?? '').toLocaleLowerCase())
    const egernKeys = records.some((item) => ['port_hopping', 'port_hopping_interval', 'skip_tls_verify', 'socks5_tls', 'auth'].some((key) => key in item))
    if (types.some((type) => ['https', 'socks5_tls'].includes(type)) || egernKeys) return { format: 'egern', label: 'Egern' }
    return { format: 'clash-yaml', label: 'Mihomo / Clash YAML' }
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

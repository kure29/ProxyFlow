import { parseClashRecords, type ClashParseResult } from './parseClash'
import { subscriptionIssue } from './errors'
import type { ParseSubscriptionOptions, SubscriptionFormat } from './types'

export type ProxyLineFormat = Extract<SubscriptionFormat, 'surge' | 'surfboard' | 'loon' | 'quantumult-x'>

const QX_TYPES = new Set(['ss', 'shadowsocks', 'ssr', 'trojan', 'vmess', 'vless', 'http', 'https', 'socks5', 'anytls'])
const NAMED_TYPES = new Set(['ss', 'shadowsocks', 'ssr', 'trojan', 'vmess', 'vless', 'http', 'https', 'socks5', 'socks5-tls', 'anytls', 'hysteria2', 'tuic', 'tuic-v5', 'snell', 'wireguard', 'ssh', 'direct', 'block', 'reject'])

export function detectProxyLineFormat(input: string): ProxyLineFormat | undefined {
  const lines = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.some((line) => /^\[[^\]]+\]$/i.test(line) && /^\[(proxy|proxy list)\]$/i.test(line))) return 'surge'
  if (lines.some((line) => {
    const pair = splitFirstUnquoted(line, '=')
    return pair && QX_TYPES.has(pair[0].trim().toLocaleLowerCase()) && /(?:^|,)\s*tag\s*=/i.test(pair[1])
  })) return 'quantumult-x'
  if (lines.some((line) => /=(?:tuic-v5|hysteria2|anytls)\s*,[^\n]*(?:port-hopping|salamander-password)/i.test(line))) return 'surfboard'
  if (lines.some((line) => /=(?:shadowsocks|tuic-v5|socks5-tls)\s*,/i.test(line))) return 'loon'
  if (lines.some((line) => isNamedProxyLine(line))) return 'surge'
  return undefined
}

export function parseProxyLineSubscription(input: string, options: ParseSubscriptionOptions, format: ProxyLineFormat): ClashParseResult {
  const sourceName = options.sourceName ?? 'Subscription'
  const records: unknown[] = []
  const issues = []
  let section: string | undefined
  const lines = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line)
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLocaleLowerCase()
      continue
    }
    if (section && section !== 'proxy' && section !== 'proxy list') continue
    const parsed = parseProxyLine(line, format)
    if (!parsed) continue
    if (parsed.issue) {
      issues.push(subscriptionIssue(parsed.issue.code, 'error', parsed.issue.message, { line: index + 1 }))
      continue
    }
    if (parsed.record) records.push(parsed.record)
  }
  const result = parseClashRecords(records, { ...options, sourceName })
  return { ...result, issues: [...issues, ...result.issues] }
}

function parseProxyLine(line: string, format: ProxyLineFormat): { record?: Record<string, unknown>; issue?: { code: string; message: string } } | undefined {
  const pair = splitFirstUnquoted(line, '=')
  if (!pair) return undefined
  const left = unquote(pair[0].trim())
  const right = pair[1].trim()
  const leftType = left.toLocaleLowerCase()
  const qx = format === 'quantumult-x' || QX_TYPES.has(leftType) && /(?:^|,)\s*tag\s*=/i.test(right)
  const first = splitCsv(right)
  const rawType = qx ? leftType : unquote(first.shift() ?? '').toLocaleLowerCase()
  if (!NAMED_TYPES.has(rawType)) return undefined
  if (['direct', 'block', 'reject'].includes(rawType)) return undefined
  const name = qx ? undefined : left
  const options = parseOptions(first)
  const positionals = qx ? [first.shift() ?? ''] : first
  const record: Record<string, unknown> = { type: normalizeLineType(rawType), name: options.tag ?? name ?? `${rawType} proxy` }
  const usesInlineHostPort = qx || format === 'loon'
  const hostPort = usesInlineHostPort ? parseHostPort(positionals.shift() ?? '') : undefined
  if (hostPort) {
    record.server = hostPort.server
    record.port = hostPort.port
  } else if (!usesInlineHostPort) {
    record.server = unquote(positionals.shift() ?? '')
    record.port = Number(unquote(positionals.shift() ?? ''))
  }
  if (!record.server || !Number.isInteger(record.port)) return { issue: { code: 'PROXY_LINE_INVALID', message: 'Proxy line is missing a valid server or port.' } }

  const type = String(record.type)
  if (type === 'ss') {
    record.cipher = options.method ?? options['encrypt-method'] ?? unquote(positionals.shift() ?? '')
    record.password = options.password ?? unquote(positionals.shift() ?? '')
  } else if (type === 'trojan') {
    record.password = options.password ?? unquote(positionals.shift() ?? '')
  } else if (type === 'vmess' || type === 'vless') {
    record.uuid = options.username ?? options.password ?? unquote(positionals.shift() ?? '')
    if (options.method) record.security = options.method
  } else if (type === 'http' || type === 'socks5') {
    record.username = options.username ?? unquote(positionals.shift() ?? '')
    record.password = options.password ?? unquote(positionals.shift() ?? '')
  } else if (type === 'hysteria2' || type === 'anytls') {
    record.password = options.password ?? unquote(positionals.shift() ?? '')
  } else if (type === 'tuic') {
    record.uuid = options.uuid ?? unquote(positionals.shift() ?? '')
    record.password = options.password ?? unquote(positionals.shift() ?? '')
  }
  applyLineOptions(record, options)
  if (rawType === 'https' || rawType === 'socks5-tls') record.tls = true
  if (rawType === 'hysteria2' || rawType === 'tuic-v5') record.tls = options.tls === undefined ? true : options.tls
  return { record }
}

function normalizeLineType(type: string) {
  if (type === 'shadowsocks') return 'ss'
  if (type === 'socks5-tls') return 'socks5'
  if (type === 'https') return 'http'
  if (type === 'tuic-v5') return 'tuic'
  return type
}

function applyLineOptions(record: Record<string, unknown>, options: Record<string, string>) {
  const bool = (value: string | undefined) => value === undefined ? undefined : /^(true|1|yes)$/i.test(value)
  const sni = options.sni ?? options['tls-name'] ?? options.servername
  if (sni) record.sni = sni
  const tls = bool(options.tls) ?? bool(options['over-tls'])
  if (tls !== undefined) record.tls = tls
  const skip = bool(options['skip-cert-verify']) ?? (options['tls-verification'] !== undefined ? !bool(options['tls-verification']) : undefined)
  if (skip !== undefined) record['skip-cert-verify'] = skip
  if (options.username) record.username = options.username
  if (options.password) record.password = options.password
  if (options.uuid) record.uuid = options.uuid
  if (options.method) record.cipher = options.method
  if (options['encrypt-method']) record.cipher = options['encrypt-method']
  if (options.alpn) record.alpn = options.alpn.split(',').map((value) => value.trim()).filter(Boolean)
  if (options.flow) record.flow = options.flow
  const simpleObfs = String(record.type) === 'ss'
    && (options.obfs !== undefined || options['obfs-host'] !== undefined || options['obfs-uri'] !== undefined)
  if (simpleObfs) {
    record.plugin = 'simple-obfs'
    record['plugin-opts'] = {
      ...(options.obfs !== undefined ? { mode: options.obfs } : {}),
      ...(options['obfs-host'] !== undefined ? { host: options['obfs-host'] } : {}),
      ...(options['obfs-uri'] !== undefined ? { uri: options['obfs-uri'] } : {}),
    }
  }
  const transport = options.transport ?? options.obfs
  if (!simpleObfs && (transport === 'ws' || transport === 'wss')) {
    record.network = 'ws'
    record['ws-opts'] = { ...(options.path || options['obfs-uri'] ? { path: options.path ?? options['obfs-uri'] } : {}), ...(options.host || options['obfs-host'] ? { headers: { Host: options.host ?? options['obfs-host'] } } : {}) }
  } else if (!simpleObfs && transport === 'grpc') {
    record.network = 'grpc'
    record['grpc-opts'] = options.path ? { 'grpc-service-name': options.path } : {}
  } else if (!simpleObfs && (transport === 'http' || transport === 'h2')) {
    record.network = transport
    record[transport === 'h2' ? 'h2-opts' : 'http-opts'] = { ...(options.path ? { path: options.path } : {}), ...(options.host ? { host: options.host } : {}) }
  }
  if (options['reality-base64-pubkey']) record['reality-opts'] = { 'public-key': options['reality-base64-pubkey'], ...(options['reality-hex-shortid'] ? { 'short-id': options['reality-hex-shortid'] } : {}) }
  if (options['server-ports'] || options['port-hopping']) record.ports = (options['server-ports'] ?? options['port-hopping']).replaceAll(';', ',')
  if (options['hop-interval'] || options['port-hopping-interval']) record['hop-interval'] = options['hop-interval'] ?? options['port-hopping-interval']
  if (options.obfs === 'salamander' && options['salamander-password']) {
    record.obfs = 'salamander'
    record['obfs-password'] = options['salamander-password']
  }
}

function parseOptions(tokens: string[]) {
  const result: Record<string, string> = {}
  for (const token of tokens) {
    const pair = splitFirstUnquoted(token, '=')
    if (!pair) continue
    result[unquote(pair[0].trim()).toLocaleLowerCase()] = unquote(pair[1].trim())
  }
  return result
}

function parseHostPort(value: string) {
  const input = unquote(value.trim())
  const match = /^\[([^\]]+)\]:(\d+)$/.exec(input) ?? /^(.+):(\d+)$/.exec(input)
  if (!match) return undefined
  const port = Number(match[2])
  return Number.isInteger(port) && port > 0 && port <= 65535 ? { server: match[1], port } : undefined
}

function isNamedProxyLine(line: string) {
  const pair = splitFirstUnquoted(line, '=')
  if (!pair) return false
  const first = splitCsv(pair[1])[0]?.toLocaleLowerCase()
  return Boolean(first && NAMED_TYPES.has(first))
}

function splitFirstUnquoted(input: string, delimiter: string) {
  let quote = ''
  let escaped = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (quote) { if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === delimiter) return [input.slice(0, index), input.slice(index + delimiter.length)] as const
  }
  return undefined
}

export function splitCsv(input: string) {
  const values: string[] = []
  let current = ''
  let quote = ''
  let escaped = false
  for (const char of input) {
    if (escaped) { current += char; escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (quote) { if (char === quote) quote = ''; else current += char; continue }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === ',') { values.push(current.trim()); current = ''; continue }
    current += char
  }
  values.push(current.trim())
  return values
}

function unquote(value: string) {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) return trimmed.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\'", "'").replaceAll('\\\\', '\\')
  return trimmed
}

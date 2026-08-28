/** Browser-safe CIDR parsing used by Surge VIF route authoring and runtime guards. */

export type CidrFamily = 'ipv4' | 'ipv6'

export interface CanonicalCidr {
  family: CidrFamily
  value: string
  address: bigint
  prefix: number
}

export type CidrParseResult = { ok: true; cidr: CanonicalCidr } | { ok: false }

const IPV4_BITS = 32
const IPV6_BITS = 128

export function parseCidr(value: unknown, mode: 'authoring' | 'strict' = 'strict'): CidrParseResult {
  if (typeof value !== 'string' || !value || value.length > 64) return { ok: false }
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value) || /[,\s]/.test(value)) return { ok: false }
  const slash = value.indexOf('/')
  if (slash <= 0 || slash !== value.lastIndexOf('/')) return { ok: false }
  const addressText = value.slice(0, slash)
  const prefixText = value.slice(slash + 1)
  if (!/^(?:0|[1-9]\d*)$/.test(prefixText)) return { ok: false }
  const prefix = Number(prefixText)
  let family: CidrFamily
  let address: bigint | undefined
  if (addressText.includes(':')) {
    family = 'ipv6'
    address = parseIpv6(addressText)
    if (address === undefined || prefix > IPV6_BITS) return { ok: false }
  } else {
    family = 'ipv4'
    address = parseIpv4(addressText)
    if (address === undefined || prefix > IPV4_BITS) return { ok: false }
  }
  if (family === 'ipv6' && isMappedIpv6(address)) return { ok: false }
  const bits = family === 'ipv6' ? IPV6_BITS : IPV4_BITS
  const mask = prefix === 0 ? 0n : (((1n << BigInt(bits)) - 1n) << BigInt(bits - prefix))
  const network = address & mask
  const canonicalAddress = family === 'ipv6' ? formatIpv6(network) : formatIpv4(network)
  const canonical = `${canonicalAddress}/${prefix}`
  if (mode === 'strict' && value !== canonical) return { ok: false }
  return { ok: true, cidr: { family, value: canonical, address: network, prefix } }
}

export function parseCidrAuthoring(value: unknown): CidrParseResult {
  return parseCidr(value, 'authoring')
}

export function isCanonicalCidr(value: unknown): value is string {
  return parseCidr(value, 'strict').ok
}

export function cidrFamily(value: unknown): CidrFamily | undefined {
  const result = parseCidr(value, 'strict')
  return result.ok ? result.cidr.family : undefined
}

function parseIpv4(value: string): bigint | undefined {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part))) return undefined
  const numbers = parts.map(Number)
  if (numbers.some((part) => part > 255)) return undefined
  return numbers.reduce((result, part) => (result << 8n) | BigInt(part), 0n)
}

function parseIpv6(value: string): bigint | undefined {
  if (!value || value.includes('%') || value.includes('[') || value.includes(']') || value.includes('.') || value.includes(':::')) return undefined
  const halves = value.split('::')
  if (halves.length > 2) return undefined
  const parseGroups = (part: string) => {
    if (!part) return [] as number[]
    const groups = part.split(':')
    if (groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return undefined
    return groups.map((group) => Number.parseInt(group, 16))
  }
  const left = parseGroups(halves[0])
  const right = parseGroups(halves.length === 2 ? halves[1] : '')
  if (!left || !right) return undefined
  const count = left.length + right.length
  if (halves.length === 1 ? count !== 8 : count >= 8) return undefined
  const groups = [...left, ...Array.from({ length: 8 - count }, () => 0), ...right]
  return groups.reduce((result, group) => (result << 16n) | BigInt(group), 0n)
}

function formatIpv4(value: bigint) {
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join('.')
}

function formatIpv6(value: bigint) {
  const groups = Array.from({ length: 8 }, (_, index) => Number((value >> BigInt((7 - index) * 16)) & 0xffffn))
  let bestStart = -1
  let bestLength = 0
  for (let start = 0; start < groups.length;) {
    if (groups[start] !== 0) { start += 1; continue }
    let end = start
    while (end < groups.length && groups[end] === 0) end += 1
    if (end - start > bestLength && end - start >= 2) { bestStart = start; bestLength = end - start }
    start = end
  }
  const hex = groups.map((group) => group.toString(16))
  if (bestStart < 0) return hex.join(':')
  const left = hex.slice(0, bestStart).join(':')
  const right = hex.slice(bestStart + bestLength).join(':')
  if (!left && !right) return '::'
  if (!left) return `::${right}`
  if (!right) return `${left}::`
  return `${left}::${right}`
}

function isMappedIpv6(value: bigint) {
  return (value >> 32n) === 0xffffn
}


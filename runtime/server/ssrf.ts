import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const DEFAULT_RUNTIME_MAX_BYTES = 2 * 1024 * 1024
export const DEFAULT_RUNTIME_TIMEOUT_MS = 12_000
export const DEFAULT_RUNTIME_MAX_REDIRECTS = 3

export class RuntimeSecurityError extends Error {
  constructor(public readonly code: 'RUNTIME_INVALID_URL' | 'RUNTIME_PRIVATE_ADDRESS' | 'RUNTIME_REDIRECT_BLOCKED') {
    super(code === 'RUNTIME_PRIVATE_ADDRESS'
      ? 'The Runtime Service refuses private or non-public destination addresses.'
      : code === 'RUNTIME_REDIRECT_BLOCKED'
        ? 'The Runtime Service refuses this redirect.'
        : 'The Runtime Service accepts only HTTP and HTTPS subscription URLs.')
    this.name = 'RuntimeSecurityError'
  }
}

export type ResolveHost = (hostname: string) => Promise<string[]>

export async function assertPublicUrl(value: string, resolveHost: ResolveHost = resolvePublicHost): Promise<URL> {
  let url: URL
  try { url = new URL(value) } catch { throw new RuntimeSecurityError('RUNTIME_INVALID_URL') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:' || url.username || url.password) {
    throw new RuntimeSecurityError('RUNTIME_INVALID_URL')
  }
  if (!url.hostname || url.hostname.length > 253) throw new RuntimeSecurityError('RUNTIME_INVALID_URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname)
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new RuntimeSecurityError('RUNTIME_PRIVATE_ADDRESS')
  }
  return url
}

export const resolvePublicHost: ResolveHost = async (hostname) => {
  const entries = await dnsLookup(hostname, { all: true, verbatim: true })
  return entries.map((entry) => entry.address)
}

export function isPublicAddress(value: string) {
  const family = isIP(value)
  if (family === 4) return isPublicIpv4(value)
  if (family === 6) return isPublicIpv6(value)
  return false
}

function isPublicIpv4(value: string) {
  const parts = value.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 2 || b === 168)) return false
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false
  if (a === 203 && b === 0) return false
  return true
}

function isPublicIpv6(value: string) {
  const groups = expandIpv6(value)
  if (!groups) return false
  const first = groups[0]
  const second = groups[1]
  if (groups.every((group) => group === 0) || groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false
  if ((first & 0xff00) === 0xff00) return false
  if ((first & 0xfe00) === 0xfc00) return false
  if ((first & 0xffc0) === 0xfe80) return false
  if (first === 0x2001 && second === 0x0db8) return false
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const mapped = `${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`
    return isPublicIpv4(mapped)
  }
  return true
}

function expandIpv6(value: string): number[] | undefined {
  const normalized = value.toLowerCase().replace(/%.+$/, '')
  if (!normalized.includes(':')) return undefined
  const halves = normalized.split('::')
  if (halves.length > 2) return undefined
  const parse = (part: string) => {
    if (!part) return []
    const groups = part.split(':')
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return undefined
    return groups.map((group) => Number.parseInt(group, 16))
  }
  const left = parse(halves[0])
  const right = parse(halves[1] ?? '')
  if (!left || !right) return undefined
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return undefined
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

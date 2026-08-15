const RESERVED_OUTBOUND_NAMES = ['DIRECT', 'REJECT', 'GLOBAL', 'PASS', 'COMPATIBLE']

export class NameRegistry {
  private readonly used = new Set<string>()

  constructor(reserved: string[] = []) {
    for (const value of reserved) this.used.add(value.toLocaleLowerCase())
  }

  allocate(preferred: string, fallback: string) {
    const base = (preferred.trim() || fallback.trim() || 'Unnamed').replaceAll(/[,\r\n]+/g, ' ')
    let candidate = base
    let suffix = 2
    while (this.used.has(candidate.toLocaleLowerCase())) candidate = `${base} ${suffix++}`
    this.used.add(candidate.toLocaleLowerCase())
    return candidate
  }
}

export const createOutboundNameRegistry = () => new NameRegistry(RESERVED_OUTBOUND_NAMES)

export function safePathSegment(value: string) {
  const normalized = value.normalize('NFKC')
    .replaceAll(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^[.-]+|[.-]+$/g, '')
    .slice(0, 72)
  return normalized || 'item'
}

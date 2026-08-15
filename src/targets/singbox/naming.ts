const RESERVED_TAGS = ['direct', 'block']

export class SingBoxNameRegistry {
  private readonly used = new Set<string>()

  constructor(reserved: string[] = RESERVED_TAGS) {
    for (const value of reserved) this.used.add(value.toLocaleLowerCase())
  }

  allocate(preferred: string, fallback: string) {
    const normalized = (preferred.trim() || fallback.trim() || 'outbound')
      .normalize('NFKC')
      .replaceAll(/[\r\n]+/g, ' ')
      .slice(0, 96)
    let candidate = normalized
    let suffix = 2
    while (this.used.has(candidate.toLocaleLowerCase())) candidate = `${normalized} ${suffix++}`
    this.used.add(candidate.toLocaleLowerCase())
    return candidate
  }
}

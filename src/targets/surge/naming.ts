const RESERVED_POLICY_NAMES = [
  'DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-NO-DROP', 'REJECT-TINYGIF',
  'CELLULAR', 'CELLULAR-ONLY', 'HYBRID', 'NO-HYBRID',
]

export class SurgeNameRegistry {
  private readonly used = new Set<string>()

  constructor(reserved: string[] = RESERVED_POLICY_NAMES) {
    for (const value of reserved) this.reserve(value)
  }

  reserve(value: string) {
    this.used.add(value.toLowerCase())
  }

  allocate(preferred: string, fallback: string) {
    const base = (preferred.trim() || fallback.trim() || 'Derived Policy')
      .normalize('NFKC')
      .replaceAll(/[,=\r\n\u0000-\u001f\u007f"\\]+/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
    let candidate = base || 'Derived Policy'
    let suffix = 2
    while (this.used.has(candidate.toLowerCase())) candidate = `${base} ${suffix++}`
    this.reserve(candidate)
    return candidate
  }
}

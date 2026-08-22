import type { RegionCode } from '../../core/proxy'

export function canonicalizeRegionSelection(values: readonly RegionCode[]) {
  return [...new Set<RegionCode>(values.map((value) => value === 'UK' ? 'GB' : value))]
}

export function toggleRegionSelection(values: readonly RegionCode[], code: RegionCode) {
  const canonical = canonicalizeRegionSelection(values)
  return canonical.includes(code)
    ? canonical.filter((value) => value !== code)
    : [...canonical, code]
}

export function clearRegionSelection() {
  return [] as RegionCode[]
}

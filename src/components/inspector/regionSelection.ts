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

export interface RegionSelectionDraft {
  committed: RegionCode[]
  draft: RegionCode[]
}

export function createRegionSelectionDraft(values: readonly RegionCode[]): RegionSelectionDraft {
  const committed = canonicalizeRegionSelection(values)
  return { committed, draft: [...committed] }
}

export function toggleRegionSelectionDraft(
  state: RegionSelectionDraft,
  code: RegionCode,
): RegionSelectionDraft {
  return { ...state, draft: toggleRegionSelection(state.draft, code) }
}

export function clearRegionSelectionDraft(state: RegionSelectionDraft): RegionSelectionDraft {
  return { ...state, draft: clearRegionSelection() }
}

export function commitRegionSelectionDraft(state: RegionSelectionDraft): RegionCode[] {
  return canonicalizeRegionSelection(state.draft)
}

export function discardRegionSelectionDraft(state: RegionSelectionDraft): RegionCode[] {
  return canonicalizeRegionSelection(state.committed)
}

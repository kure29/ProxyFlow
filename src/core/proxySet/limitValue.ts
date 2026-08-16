export type LimitDraftResult =
  | { status: 'empty' | 'invalid' }
  | { status: 'number'; value: number; valid: boolean }

export function parseLimitDraft(draft: string): LimitDraftResult {
  const value = draft.trim()
  if (!value) return { status: 'empty' }
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return { status: 'invalid' }
  const number = Number(value)
  if (!Number.isFinite(number)) return { status: 'invalid' }
  return { status: 'number', value: number, valid: /^\d+$/.test(value) && Number.isInteger(number) && number > 0 }
}

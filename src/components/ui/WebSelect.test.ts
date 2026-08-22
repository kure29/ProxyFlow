import { describe, expect, it } from 'vitest'
import { firstEnabledIndex, lastEnabledIndex, moveEnabledIndex, type WebSelectOption } from './webSelectModel'

const options: WebSelectOption[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B', disabled: true },
  { value: 'c', label: 'C' },
]

describe('WebSelect keyboard navigation', () => {
  it('finds the first and last enabled options', () => {
    expect(firstEnabledIndex(options)).toBe(0)
    expect(lastEnabledIndex(options)).toBe(2)
  })

  it('skips disabled options and wraps in both directions', () => {
    expect(moveEnabledIndex(options, 0, 1)).toBe(2)
    expect(moveEnabledIndex(options, 2, 1)).toBe(0)
    expect(moveEnabledIndex(options, 0, -1)).toBe(2)
  })

  it('returns -1 when no options can be selected', () => {
    const disabled = [{ value: 'a', label: 'A', disabled: true }]
    expect(firstEnabledIndex(disabled)).toBe(-1)
    expect(lastEnabledIndex(disabled)).toBe(-1)
    expect(moveEnabledIndex(disabled, -1, 1)).toBe(-1)
  })
})

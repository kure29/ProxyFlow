import { describe, expect, it } from 'vitest'
import { parseLimitDraft } from './limitValue'

describe('Limit draft parsing', () => {
  it.each(['10', '20', ' 10 '])('accepts positive integer %s', (draft) => {
    expect(parseLimitDraft(draft)).toEqual({ status: 'number', value: Number(draft), valid: true })
  })

  it.each([
    ['0', { status: 'number', value: 0, valid: false }],
    ['-1', { status: 'number', value: -1, valid: false }],
    ['1.5', { status: 'number', value: 1.5, valid: false }],
    ['', { status: 'empty' }],
    ['NaN', { status: 'invalid' }],
    ['1e3', { status: 'invalid' }],
  ])('rejects invalid semantic input %s without producing NaN', (draft, expected) => {
    expect(parseLimitDraft(draft)).toEqual(expected)
  })
})

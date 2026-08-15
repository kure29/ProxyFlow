import { describe, expect, it } from 'vitest'
import { NameRegistry, safePathSegment } from './naming'

describe('Mihomo naming', () => {
  it('keeps names stable and resolves collisions across references', () => {
    const names = new NameRegistry(['DIRECT'])
    expect(names.allocate('US Auto', 'a')).toBe('US Auto')
    expect(names.allocate('US Auto', 'b')).toBe('US Auto 2')
    expect(names.allocate('direct', 'c')).toBe('direct 2')
  })

  it('creates filesystem-safe paths while preserving readable Unicode', () => {
    expect(safePathSegment('香港 / US: Auto?')).toBe('香港-US-Auto')
    expect(safePathSegment('///')).toBe('item')
  })
})

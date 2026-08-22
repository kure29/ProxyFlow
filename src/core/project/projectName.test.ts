import { describe, expect, it } from 'vitest'
import { countProjectNameGraphemes, normalizeValidProjectName, validateProjectName } from './projectName'

describe('Project name validation', () => {
  it('counts user-visible graphemes rather than UTF-16 code units', () => {
    expect(countProjectNameGraphemes('😀😀😀')).toBe(3)
    expect(countProjectNameGraphemes('e\u0301')).toBe(1)
    expect(countProjectNameGraphemes('👨‍👩‍👧‍👦')).toBe(1)
  })

  it('accepts at most twenty graphemes and trims persisted names', () => {
    expect(validateProjectName('  ProxyFlow  ')).toBe('valid')
    expect(normalizeValidProjectName('  ProxyFlow  ')).toBe('ProxyFlow')
    expect(validateProjectName('😀'.repeat(20))).toBe('valid')
    expect(validateProjectName('😀'.repeat(21))).toBe('too-long')
    expect(normalizeValidProjectName('   ')).toBeNull()
  })
})

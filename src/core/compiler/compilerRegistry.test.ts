import { describe, expect, it } from 'vitest'
import { compilerRegistry } from './index'

describe('CompilerRegistry', () => {
  it('registers the real Mihomo compiler and no other target', () => {
    expect(compilerRegistry.get('mihomo')?.target).toBe('mihomo')
    expect(compilerRegistry.get('sing-box')).toBeUndefined()
    expect(compilerRegistry.get('surge')).toBeUndefined()
  })
})

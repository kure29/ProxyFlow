import { describe, expect, it } from 'vitest'
import type { ConfigCompiler } from './compilerTypes'
import { CompilerRegistry } from './compilerTypes'
import { compilerRegistry } from './index'

describe('CompilerRegistry', () => {
  it('lazy-loads all registered backend compilers while leaving unimplemented targets unavailable', async () => {
    expect(compilerRegistry.getLoaded('mihomo')).toBeUndefined()
    expect((await compilerRegistry.load('mihomo'))?.target).toBe('mihomo')
    expect((await compilerRegistry.load('sing-box'))?.target).toBe('sing-box')
    expect((await compilerRegistry.load('surge'))?.target).toBe('surge')
    expect((await compilerRegistry.load('loon'))?.target).toBe('loon')
    expect((await compilerRegistry.load('shadowrocket'))?.target).toBe('shadowrocket')
  })

  it('deduplicates concurrent loads and retries after a loader failure', async () => {
    const registry = new CompilerRegistry()
    let loads = 0
    const compiler = { target: 'mihomo', compile: async () => ({
      success: true, content: '', issues: [], generatedAt: '', mock: false,
    }) } satisfies ConfigCompiler
    registry.register('mihomo', async () => {
      loads += 1
      return compiler
    })
    const [first, second] = await Promise.all([registry.load('mihomo'), registry.load('mihomo')])
    expect(first).toBe(compiler)
    expect(second).toBe(compiler)
    expect(loads).toBe(1)

    const retrying = new CompilerRegistry()
    retrying.register('sing-box', async () => {
      loads += 1
      if (loads === 2) throw new Error('chunk failed')
      return { ...compiler, target: 'sing-box' }
    })
    await expect(retrying.load('sing-box')).rejects.toThrow('chunk failed')
    expect((await retrying.load('sing-box'))?.target).toBe('sing-box')
  })
})

import { describe, expect, it } from 'vitest'
import { PRIMARY_TARGETS, targetCapabilityRegistry } from '../capabilities/targetCapabilities'
import type { ConfigCompiler, TargetAdapter } from './compilerTypes'
import { CompilerRegistry, TargetRegistry } from './compilerTypes'
import { compilerRegistry, targetRegistry } from './index'

describe('CompilerRegistry', () => {
  it('exposes one adapter for every registered target and rejects unknown targets', () => {
    for (const target of PRIMARY_TARGETS) {
      const adapter = targetRegistry.get(target)
      expect(adapter).toEqual(expect.objectContaining({
        target,
        capabilities: targetCapabilityRegistry[target],
        compatibility: expect.any(Function),
        compiler: expect.any(Function),
      }))
      expect(adapter?.proxyCompatibility).toEqual(expect.any(Function))
    }
    expect(targetRegistry.get('quantumult-x')).toBeUndefined()
    expect(targetRegistry.get('future-target' as never)).toBeUndefined()
    expect(targetRegistry.has('quantumult-x')).toBe(false)
  })

  it('rejects duplicate and invalid adapter registration deterministically', () => {
    const registry = new TargetRegistry()
    const compiler = { target: 'mihomo', compile: async () => ({ success: true, content: '', issues: [], generatedAt: '', mock: false }) } satisfies ConfigCompiler
    const adapter: TargetAdapter = {
      target: 'mihomo',
      capabilities: targetCapabilityRegistry.mihomo,
      proxyCompatibility: () => ({ status: 'supported', unsupportedFeatures: [] }),
      compatibility: () => [],
      compiler: async () => compiler,
    }
    expect(registry.register(adapter)).toBe(true)
    expect(registry.register(adapter)).toBe(false)
    expect(registry.register('future-target' as never, async () => compiler)).toBe(false)
    expect(registry.register({ ...adapter, target: 'surge' } as TargetAdapter)).toBe(false)
    expect(registry.register({ ...adapter, capabilities: targetCapabilityRegistry.surge } as TargetAdapter)).toBe(false)
    expect(registry.get('mihomo')).toBe(adapter)
  })

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

import { describe, expect, it, vi } from 'vitest'
import type { ProxyFlowIR } from './ir'
import { getTargetBranch, listTargetBranches } from './targetBranch'

function sharedPolicy(target: ProxyFlowIR['outputs'][number]['target']): ProxyFlowIR {
  return {
    version: 2,
    metadata: { projectId: 'shared-policy-test', projectName: 'Shared Policy', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
      kind: 'http', protocol: 'http', id: 'proxy', name: 'Proxy', server: 'proxy.example.com', port: 8080,
    }] }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'strategy', name: 'Select', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{ id: 'route', name: 'Route', matcher: { kind: 'domain-suffix', value: 'example.com' }, target: { kind: 'strategy', id: 'strategy' }, priority: 1 }],
    finalRoute: { target: { kind: 'direct' } },
    dns: undefined,
    outputs: [{ id: `output-${target}`, name: 'Output', target, enabled: true }],
  }
}

describe('target branch boundary', () => {
  it('resolves branches from the existing TargetRegistry and fails closed for unknown targets', () => {
    expect(getTargetBranch('mihomo')).toEqual(expect.objectContaining({
      target: 'mihomo',
      capabilities: expect.objectContaining({ target: 'mihomo' }),
      adapter: expect.objectContaining({ target: 'mihomo' }),
    }))
    expect(getTargetBranch('future-target')).toBeUndefined()
    expect(listTargetBranches().map((branch) => branch.target)).toEqual(['mihomo', 'sing-box', 'surge', 'loon', 'shadowrocket'])
  })

  it('delegates compatibility and assessment to the registered adapter', async () => {
    const branch = getTargetBranch('mihomo')!
    const original = branch.adapter.compatibility
    const delegated = vi.fn(original)
    branch.adapter.compatibility = delegated
    try {
      const ir = sharedPolicy('mihomo')
      await branch.compatibility(ir)
      const assessment = await branch.assess(ir)
      expect(assessment.target).toBe('mihomo')
    } finally {
      branch.adapter.compatibility = original
    }
    expect(delegated).toHaveBeenCalledTimes(2)
  })

  it('compiles the same shared policy through independent target branches', async () => {
    const results = await Promise.all(listTargetBranches().map(async (branch) => ({
      target: branch.target,
      result: await branch.compile(sharedPolicy(branch.target)),
    })))
    expect(results.map(({ target }) => target)).toEqual(['mihomo', 'sing-box', 'surge', 'loon', 'shadowrocket'])
    expect(results.every(({ result }) => typeof result.success === 'boolean')).toBe(true)
  })
})

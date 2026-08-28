import { describe, expect, it } from 'vitest'
import type { TargetNativeSurgeGeneralProxyBypassIR } from '../../core/targetNative'
import { compileSurgeGeneralProxyBypass, composeSurgeGeneral } from './general'
import { isSurgeGeneralEntry } from './model'
import { serializeSurgeProfile } from './serializer'

const bypass = (overrides: Partial<TargetNativeSurgeGeneralProxyBypassIR> = {}): TargetNativeSurgeGeneralProxyBypassIR => ({
  outputNodeId: 'output', target: 'surge', kind: 'general-proxy-bypass', skipProxy: ['apple.com', '*apple.com', 'localhost', '192.168.2.0/24'], excludeSimpleHostnames: false, ...overrides,
})
describe('Surge G3-C General lowering', () => {
  it('emits typed Host List then explicit Boolean in deterministic order', () => {
    const entries = compileSurgeGeneralProxyBypass(bypass())
    expect(entries).toEqual([
      { key: 'skip-proxy', value: { kind: 'host-list', items: ['apple.com', '*apple.com', 'localhost', '192.168.2.0/24'] } },
      { key: 'exclude-simple-hostnames', value: false },
    ])
    expect(entries.every((entry) => isSurgeGeneralEntry(entry))).toBe(true)
    const content = serializeSurgeProfile({ general: entries, proxies: [], proxyGroups: [], rules: [] })
    expect(content).toContain('skip-proxy = apple.com, *apple.com, localhost, 192.168.2.0/24')
    expect(content).toContain('exclude-simple-hostnames = false')
  })

  it('omits unset fields and preserves existing General key ownership', () => {
    expect(compileSurgeGeneralProxyBypass({ ...bypass(), skipProxy: undefined, excludeSimpleHostnames: undefined })).toEqual([])
    const issues: never[] = []
    expect(composeSurgeGeneral([[{ key: 'proxy-test-url', value: 'https://proxy.example.test' }], compileSurgeGeneralProxyBypass(bypass())], issues)).toHaveLength(3)
    expect(issues).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { processingCreationOptions, routingCreationOptions, strategyCreationOptions } from './workspaceCreation'

describe('Workspace creation options', () => {
  it('keeps Processing and Basic Routing on existing graph node types', () => {
    expect(processingCreationOptions.map((option) => option.blockType)).toEqual([
      'filter', 'rename', 'sort', 'deduplicate', 'merge', 'limit',
    ])
    expect(routingCreationOptions.map((option) => option.blockType)).toEqual([
      'service-rule', 'custom-rule', 'custom-rule', 'custom-rule',
    ])
    expect(routingCreationOptions.map((option) => option.data?.routeMatcherKind)).toEqual([
      'service', 'domain-suffix', 'ip-cidr', 'port',
    ])
  })

  it('uses the Capability Registry to gate Strategy creation', () => {
    const mihomo = strategyCreationOptions('mihomo')
    const singBox = strategyCreationOptions('sing-box')

    expect(mihomo.find((option) => option.id === 'failover')).toEqual(expect.objectContaining({ disabled: false, status: 'supported' }))
    expect(mihomo.find((option) => option.id === 'load-balance')).toEqual(expect.objectContaining({ advanced: true, disabled: false, status: 'target-native' }))
    expect(singBox.find((option) => option.id === 'failover')).toEqual(expect.objectContaining({ disabled: true, status: 'unsupported' }))
    expect(singBox.find((option) => option.id === 'load-balance')).toEqual(expect.objectContaining({ advanced: true, disabled: true, status: 'unsupported' }))
    expect(mihomo.map((option) => option.blockType)).toEqual([
      'manual-select', 'auto-select', 'fallback', 'load-balance', 'proxy-chain',
    ])
    expect(mihomo.find((option) => option.id === 'chain')).toEqual(expect.objectContaining({ blockType: 'proxy-chain', advanced: true, disabled: false }))
  })
})

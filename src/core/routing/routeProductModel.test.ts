import { describe, expect, it } from 'vitest'
import { demoNodes } from '../../data/demoProject'
import { blockByType, blockLibrary } from '../../data/blockLibrary'
import type { GraphNode } from '../../types/project'
import { moveRoutingRule, moveRoutingRuleToIndex, rankRoutingRules, rankWorkspaceRoutingRules, resolveRouteMatcherKind, routeMatcherSelectionPatch, routeOrder } from './routeProductModel'

const route = (id: string, blockType: GraphNode['data']['blockType'], routePriority?: number): GraphNode => ({
  id, type: 'block', position: { x: 0, y: 0 }, data: {
    blockType, category: 'routing', title: id, subtitle: '', icon: 'blocks', routePriority,
    ...(blockType === 'custom-rule' ? { routeMatcherKind: 'domain-suffix' as const, routeMatcherValue: 'example.com' } : {}),
  },
})

describe('routing product model adapter', () => {
  it('normalizes legacy service and custom nodes without changing their serialized type', () => {
    expect(resolveRouteMatcherKind(route('group', 'routing-group').data)).toBe('service')
    expect(resolveRouteMatcherKind(route('service', 'service-rule').data)).toBe('service')
    expect(resolveRouteMatcherKind(route('custom', 'custom-rule').data)).toBe('domain-suffix')
    expect(route('group', 'routing-group').data.blockType).toBe('routing-group')
  })

  it('uses lower priority first and insertion order as the stable tie-break', () => {
    const nodes = [route('first', 'service-rule', 10), route('second', 'custom-rule', 10), route('third', 'routing-group', 5)]
    expect(rankRoutingRules(nodes).map(({ node }) => node.id)).toEqual(['third', 'first', 'second'])
  })

  it('keeps DEST-PORT to SRC-PORT selection visually and semantically atomic', () => {
    const destinationPort = {
      ...route('port', 'custom-rule').data,
      routeMatcherKind: 'port' as const,
      routeMatcherPort: 443,
    }
    const sourcePortPatch = routeMatcherSelectionPatch('source-port', destinationPort, 'surge')
    expect(sourcePortPatch).toEqual(expect.objectContaining({
      routeMatcherKind: 'source-port',
      routeMatcherPort: 443,
      targetNativeSourcePort: { target: 'surge', kind: 'source-port', port: 443 },
    }))

    expect(routeMatcherSelectionPatch('domain', { ...destinationPort, ...sourcePortPatch }, 'surge')).toEqual(expect.objectContaining({
      routeMatcherKind: 'domain',
      targetNativeSourcePort: undefined,
    }))
    expect(routeMatcherSelectionPatch('source-port', destinationPort, 'mihomo')).toEqual(expect.objectContaining({
      routeMatcherPort: undefined,
      targetNativeSourcePort: undefined,
    }))
  })

  it('moves visible routing rules by assigning deterministic priorities', () => {
    const nodes = [route('first', 'service-rule', 10), route('second', 'custom-rule', 20), route('third', 'routing-group', 30)]
    const moved = moveRoutingRule(nodes, 'second', 'up')
    expect(rankRoutingRules(moved).map(({ node }) => node.id)).toEqual(['second', 'first', 'third'])
    expect(routeOrder('second', moved)).toEqual({ index: 0, count: 3, canMoveUp: false, canMoveDown: true })
  })

  it('moves a rule directly to a semantic list index and retains disabled rules in Workspace', () => {
    const disabled = route('disabled', 'service-rule', 20)
    disabled.data.disabled = true
    const nodes = [route('first', 'service-rule', 10), disabled, route('third', 'custom-rule', 30)]
    expect(rankRoutingRules(nodes).map(({ node }) => node.id)).toEqual(['first', 'third'])
    expect(rankWorkspaceRoutingRules(nodes).map(({ node }) => node.id)).toEqual(['first', 'disabled', 'third'])
    expect(rankWorkspaceRoutingRules(moveRoutingRuleToIndex(nodes, 'third', 0)).map(({ node }) => node.id)).toEqual(['third', 'first', 'disabled'])
  })

  it('keeps the demo graph routable through the adapter', () => {
    expect(demoNodes.filter((node) => node.data.blockType === 'routing-group').every((node) => resolveRouteMatcherKind(node.data) === 'service')).toBe(true)
  })

  it('shows one Routing Rule entry while keeping legacy definitions resolvable', () => {
    const routingGroup = blockLibrary.find((group) => group.category === 'routing')!
    expect(routingGroup.items.map((item) => item.type)).toEqual(['service-rule', 'final'])
    expect(blockByType.has('routing-group')).toBe(true)
    expect(blockByType.has('custom-rule')).toBe(true)
  })

  it('shows URL, pasted-link, and configuration-file source actions while preserving legacy source definitions', () => {
    const sourceGroup = blockLibrary.find((group) => group.category === 'source')!
    expect(sourceGroup.items.map((item) => item.type)).toEqual(['subscription', 'manual-proxy', 'import-config'])
    expect(sourceGroup.items.some((item) => item.type === 'provider')).toBe(false)
    expect(blockByType.get('manual-proxy')?.icon).toBe('server')
    expect(blockByType.has('provider')).toBe(true)
    expect(blockByType.has('import-config')).toBe(true)
  })

  it('places Proxy Chain in the Strategy library group without changing its graph category', () => {
    const strategyGroups = blockLibrary.filter((group) => group.category === 'strategy')
    expect(strategyGroups.flatMap((group) => group.items).map((item) => item.type)).toContain('proxy-chain')
    expect(blockLibrary.some((group) => group.category === 'chain')).toBe(false)
    expect(blockByType.get('proxy-chain')?.category).toBe('chain')
  })
})

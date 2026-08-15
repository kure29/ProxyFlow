import { beforeEach, describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { useBuilderStore } from './useBuilderStore'

describe('builder store', () => {
  beforeEach(() => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
  })

  it('adds and removes a node', () => {
    const initialCount = useBuilderStore.getState().nodes.length
    const id = useBuilderStore.getState().addNode('manual-proxy', { x: 120, y: 120 })
    expect(id).toBeTruthy()
    expect(useBuilderStore.getState().nodes).toHaveLength(initialCount + 1)
    useBuilderStore.getState().removeNode(id!)
    expect(useBuilderStore.getState().nodes).toHaveLength(initialCount)
  })

  it('connects compatible nodes and rejects incompatible nodes', () => {
    const initialCount = useBuilderStore.getState().edges.length
    expect(useBuilderStore.getState().connect({ source: 'hkt-subscription', target: 'hk-filter', sourceHandle: null, targetHandle: null })).toBe(true)
    expect(useBuilderStore.getState().edges).toHaveLength(initialCount + 1)
    expect(useBuilderStore.getState().connect({ source: 'output', target: 'hkt-subscription', sourceHandle: null, targetHandle: null })).toBe(false)
  })

  it('updates node data and supports undo', () => {
    useBuilderStore.getState().updateNodeData('hk-filter', { title: 'HK Only' })
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'hk-filter')?.data.title).toBe('HK Only')
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'hk-filter')?.data.title).toBe('香港节点筛选')
  })

  it('adds, reorders and removes proxy chain hops', () => {
    useBuilderStore.getState().addHop('us-via-hk')
    const chainAfterAdd = useBuilderStore.getState().nodes.find((node) => node.id === 'us-via-hk')!
    expect(chainAfterAdd.data.hopIds).toHaveLength(3)
    const thirdHop = chainAfterAdd.data.hopIds![2]

    useBuilderStore.getState().moveHop('us-via-hk', 2, 1)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'us-via-hk')?.data.hopIds?.[1]).toBe(thirdHop)

    useBuilderStore.getState().removeHop('us-via-hk', thirdHop)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'us-via-hk')?.data.hopIds).toHaveLength(2)
  })

  it('keeps protected nodes when delete is requested', () => {
    useBuilderStore.getState().removeNode('final-route')
    expect(useBuilderStore.getState().nodes.some((node) => node.id === 'final-route')).toBe(true)
  })
})

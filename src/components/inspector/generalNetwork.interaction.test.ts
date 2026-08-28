import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  state: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  cursor: 0,
  refCursor: 0,
  effects: [] as Array<readonly unknown[] | undefined>,
  previousEffects: [] as Array<readonly unknown[] | undefined>,
  updateNodeData: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      const index = harness.cursor++
      if (!(index in harness.state)) harness.state[index] = initial
      return [harness.state[index] as T, (next: T | ((current: T) => T)) => {
        harness.state[index] = typeof next === 'function'
          ? (next as (current: T) => T)(harness.state[index] as T)
          : next
      }] as const
    },
    useRef: <T,>(initial: T) => {
      const index = harness.refCursor++
      if (!harness.refs[index]) harness.refs[index] = { current: initial }
      return harness.refs[index] as { current: T }
    },
    useMemo: <T,>(factory: () => T) => factory(),
    useEffect: (effect: () => void, deps?: readonly unknown[]) => {
      const index = harness.effects.length
      const previous = harness.previousEffects[index]
      const changed = !deps || !previous || deps.length !== previous.length
        || deps.some((value, depIndex) => value !== previous[depIndex])
      harness.effects[index] = deps
      if (changed) effect()
    },
  }
})

vi.mock('../../store/useBuilderStore', () => ({
  useBuilderStore: (selector: (state: { updateNodeData: typeof harness.updateNodeData }) => unknown) => selector({
    updateNodeData: harness.updateNodeData,
  }),
}))

vi.mock('../../i18n', async () => {
  const actual = await vi.importActual<typeof import('../../i18n')>('../../i18n')
  return {
    ...actual,
    useI18n: () => ({
      locale: 'en-US',
      t: (key: string) => key,
      formatDateTime: (value: string) => value,
    }),
  }
})

function findTextareas(value: any): any[] {
  if (!value || typeof value !== 'object') return []
  const matches = value.type === 'textarea' ? [value] : []
  const children = value.props?.children
  for (const child of Array.isArray(children) ? children : [children]) matches.push(...findTextareas(child))
  return matches
}

describe('Surge General Network VIF route draft lifecycle', () => {
  it('preserves local drafts, commits canonical CIDRs, and synchronizes actual persisted changes', async () => {
    harness.state = []
    harness.refs = []
    harness.previousEffects = []
    harness.updateNodeData.mockReset()
    const { SurgeGeneralNetworkEditor } = await import('./Inspector')
    const node: any = {
      id: 'output',
      data: {
        targetNativeSurgeGeneralNetwork: {
          target: 'surge',
          kind: 'general-network',
          ipv6Vif: 'always',
          tunExcludedRoutes: ['10.0.0.0/8'],
          tunIncludedRoutes: ['192.168.1.100/32'],
        },
      },
    }
    const render = () => {
      harness.cursor = 0
      harness.refCursor = 0
      harness.effects = []
      const rendered = SurgeGeneralNetworkEditor({ node, primaryTarget: 'surge' })
      harness.previousEffects = harness.effects.slice()
      return rendered
    }
    const routes = () => findTextareas(render())

    expect(routes().map((textarea) => textarea.props.value)).toEqual([
      '10.0.0.0/8',
      '192.168.1.100/32',
    ])

    const typed = '10.0.0.0/8\n192.0.2.123/24'
    routes()[0].props.onChange({ target: { value: typed } })
    expect(routes()[0].props.value).toBe(typed)
    expect(harness.updateNodeData).not.toHaveBeenCalled()

    for (const partial of ['1', '192.', '192.0.', '192.0.2.', '192.0.2.123/', '192.0.2.123/2', typed]) {
      routes()[0].props.onChange({ target: { value: partial } })
      expect(routes()[0].props.value).toBe(partial)
      expect(harness.updateNodeData).not.toHaveBeenCalled()
    }

    routes()[0].props.onBlur()
    expect(harness.updateNodeData).toHaveBeenCalledWith('output', {
      targetNativeSurgeGeneralNetwork: {
        target: 'surge',
        kind: 'general-network',
        ipv6Vif: 'always',
        tunExcludedRoutes: ['10.0.0.0/8', '192.0.2.0/24'],
        tunIncludedRoutes: ['192.168.1.100/32'],
      },
    })

    node.data.targetNativeSurgeGeneralNetwork = {
      target: 'surge',
      kind: 'general-network',
      ipv6Vif: 'always',
      tunExcludedRoutes: ['203.0.113.0/24'],
      tunIncludedRoutes: ['192.168.1.100/32'],
    }
    render()
    expect(routes()[0].props.value).toBe('203.0.113.0/24')
  })
})


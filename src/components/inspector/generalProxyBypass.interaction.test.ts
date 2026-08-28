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

function findElements(value: any, predicate: (element: any) => boolean): any[] {
  if (!value || typeof value !== 'object') return []
  const matches = predicate(value) ? [value] : []
  const children = value.props?.children
  for (const child of Array.isArray(children) ? children : [children]) matches.push(...findElements(child, predicate))
  return matches
}

function findTextarea(value: any) {
  return findElements(value, (element) => element.type === 'textarea')[0]
}

describe('Surge General Proxy Bypass editor lifecycle', () => {
  it('preserves local drafts across rerenders and Boolean changes, then syncs external skipProxy changes', async () => {
    harness.state = []
    harness.refs = []
    harness.previousEffects = []
    harness.updateNodeData.mockReset()
    const { SurgeGeneralProxyBypassEditor } = await import('./Inspector')
    const node: any = {
      id: 'output',
      data: {
        targetNativeSurgeGeneralProxyBypass: {
          target: 'surge',
          kind: 'general-proxy-bypass',
          skipProxy: ['apple.com'],
        },
      },
    }
    const render = () => {
      harness.cursor = 0
      harness.refCursor = 0
      harness.effects = []
      const rendered = SurgeGeneralProxyBypassEditor({ node, primaryTarget: 'surge' })
      harness.previousEffects = harness.effects.slice()
      return rendered
    }

    expect(findTextarea(render())?.props.value).toBe('apple.com')
    for (const partial of [
      '*', '*a', '*apple', '*apple.', '*apple.com',
      '192.', '192.168.', '192.168.2.', '192.168.2.*',
      '192.168.2.123/', '192.168.2.123/2', '192.168.2.123/24',
    ]) {
      findTextarea(render()).props.onChange({ target: { value: partial } })
      expect(findTextarea(render())?.props.value).toBe(partial)
      expect(harness.updateNodeData).not.toHaveBeenCalled()
    }

    const localDraft = 'apple.com\n192.168.2.123/'
    findTextarea(render()).props.onChange({ target: { value: localDraft } })
    expect(findTextarea(render())?.props.value).toBe(localDraft)

    const { WebSelect } = await import('../ui/WebSelect')
    const select = findElements(render(), (element) => element.type === WebSelect)[0]
    expect(select?.props.value).toBe('default')
    select.props.onChange('enabled')
    expect(harness.updateNodeData).toHaveBeenCalledWith('output', {
      targetNativeSurgeGeneralProxyBypass: {
        target: 'surge',
        kind: 'general-proxy-bypass',
        skipProxy: ['apple.com'],
        excludeSimpleHostnames: true,
      },
    })
    node.data.targetNativeSurgeGeneralProxyBypass = harness.updateNodeData.mock.calls.at(-1)![1].targetNativeSurgeGeneralProxyBypass
    harness.updateNodeData.mockReset()

    expect(findTextarea(render())?.props.value).toBe(localDraft)
    expect(findElements(render(), (element) => element.type === WebSelect)[0]?.props.value).toBe('enabled')

    const committedDraft = 'apple.com\n192.168.2.123/24'
    findTextarea(render()).props.onChange({ target: { value: committedDraft } })
    findTextarea(render()).props.onBlur()
    expect(harness.updateNodeData).toHaveBeenCalledWith('output', {
      targetNativeSurgeGeneralProxyBypass: {
        target: 'surge',
        kind: 'general-proxy-bypass',
        skipProxy: ['apple.com', '192.168.2.0/24'],
        excludeSimpleHostnames: true,
      },
    })

    node.data.targetNativeSurgeGeneralProxyBypass = {
      target: 'surge',
      kind: 'general-proxy-bypass',
      skipProxy: ['store.apple.com'],
      excludeSimpleHostnames: true,
    }
    render()
    expect(findTextarea(render())?.props.value).toBe('store.apple.com')
  })

  it.each([
    { target: 'surge', kind: 'general-proxy-bypass', skipProxy: 'apple.com' },
    { target: 'surge', kind: 'general-proxy-bypass', skipProxy: [123] },
    { target: 'surge', kind: 'general-proxy-bypass', skipProxy: null },
    { target: 'surge', kind: 'general-proxy-bypass', skipProxy: {} },
    { target: 'surge', kind: 'general-proxy-bypass', excludeSimpleHostnames: 'true' },
    { target: 'surge', kind: 'general-proxy-bypass', excludeSimpleHostnames: 1 },
  ])('keeps malformed retained state explicit-remove-only (%j)', async (config) => {
    harness.state = []
    harness.refs = []
    harness.previousEffects = []
    harness.updateNodeData.mockReset()
    const { SurgeGeneralProxyBypassEditor } = await import('./Inspector')
    const node: any = { id: 'output', data: { targetNativeSurgeGeneralProxyBypass: config } }
    const render = () => {
      harness.cursor = 0
      harness.refCursor = 0
      harness.effects = []
      const rendered = SurgeGeneralProxyBypassEditor({ node, primaryTarget: 'surge' })
      harness.previousEffects = harness.effects.slice()
      return rendered
    }
    const rendered = render()
    expect(findTextarea(rendered)).toBeUndefined()
    expect(findElements(rendered, (element) => typeof element.type === 'string' && element.type === 'button')).toHaveLength(1)
    expect(harness.updateNodeData).not.toHaveBeenCalled()
    render()
    expect(harness.updateNodeData).not.toHaveBeenCalled()

    const remove = findElements(rendered, (element) => element.type === 'button')[0]
    remove.props.onClick()
    expect(harness.updateNodeData).toHaveBeenCalledTimes(1)
    expect(harness.updateNodeData).toHaveBeenCalledWith('output', { targetNativeSurgeGeneralProxyBypass: undefined })
  })
})

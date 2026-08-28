import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  state: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  cursor: 0,
  refCursor: 0,
  effects: [] as Array<readonly unknown[] | undefined>,
  previousEffects: [] as Array<readonly unknown[] | undefined>,
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      const index = harness.cursor++
      if (!(index in harness.state)) harness.state[index] = initial
      return [harness.state[index] as T, (next: T | ((current: T) => T)) => {
        harness.state[index] = typeof next === 'function' ? (next as (current: T) => T)(harness.state[index] as T) : next
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
      const changed = !deps || !previous || deps.length !== previous.length || deps.some((value, depIndex) => value !== previous[depIndex])
      harness.effects[index] = deps
      if (changed) effect()
    },
  }
})

const copy = {
  emptyTitle: 'No DNS resolvers yet', emptyDescription: 'Add a resolver.', addDns: 'Add DNS settings', resolverDescription: 'Resolver capabilities are validated.',
  addResolver: 'Add resolver', customResolver: 'Custom resolver', name: 'Name', protocol: 'Protocol', endpoint: 'Endpoint', role: 'Role', enabled: 'Enabled', remove: 'Remove resolver', unsupported: 'Unsupported by target',
  roles: { default: 'Default', direct: 'Direct', fallback: 'Fallback' }, regions: { system: 'Device', global: 'Global', 'mainland-china': 'Mainland China' },
}

function findTextarea(value: any): any {
  if (!value || typeof value !== 'object') return undefined
  if (value.type === 'textarea') return value
  const children = value.props?.children
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findTextarea(child)
    if (match) return match
  }
  return undefined
}

describe('DNS Workspace always-real-ip draft lifecycle', () => {
  it('keeps typed drafts across rerenders and synchronizes only persisted changes', async () => {
    const { DnsWorkspace } = await import('./DnsWorkspace')
    const onChange = vi.fn()
    const node: any = {
      id: 'dns',
      targetNativeSurgeDnsBehavior: { target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com'] },
    }
    const render = () => {
      harness.cursor = 0
      harness.refCursor = 0
      harness.effects = []
      const rendered = DnsWorkspace({ node, target: 'surge', copy, onCreateDns: vi.fn(), onChange })
      harness.previousEffects = harness.effects.slice()
      return rendered
    }

    const first = render()
    expect(findTextarea(first).props.value).toBe('example.com')
    findTextarea(first).props.onChange({ target: { value: 'example.com\n*.example.com' } })
    const rerendered = render()
    expect(findTextarea(rerendered).props.value).toBe('example.com\n*.example.com')
    expect(onChange).not.toHaveBeenCalled()

    for (const partial of ['*', '*.', '*.e', '*.example.com']) {
      findTextarea(render()).props.onChange({ target: { value: partial } })
      expect(findTextarea(render()).props.value).toBe(partial)
    }

    node.targetNativeSurgeDnsBehavior = { target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['*.persisted.example'] }
    render()
    expect(findTextarea(render()).props.value).toBe('*.persisted.example')
  })
})

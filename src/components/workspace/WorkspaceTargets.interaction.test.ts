import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
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
  }
})

vi.mock('../../i18n', async () => {
  const actual = await vi.importActual<typeof import('../../i18n')>('../../i18n')
  return {
    ...actual,
    useI18n: () => ({
      locale: 'en-US',
      t: (key: string) => key,
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

function profile() {
  return {
    preset: 'local-proxy' as const, mixedPort: 7890, allowLan: true, ipv6: true,
    dnsMode: 'redir-host' as const, tunStack: 'mixed' as const, strictRoute: false,
    sniffer: false, storeSelected: true, unifiedDelay: true, tcpConcurrent: true,
  }
}

describe('Mihomo managed settings UI bridge', () => {
  it('edits managed fields, preserves explicit false, and clears back to inheritance', async () => {
    harness.state = []
    harness.cursor = 0
    const { MihomoSettingsDrawer } = await import('./WorkspaceTargets')
    const onManagedChange = vi.fn()
    const onManagedReset = vi.fn()
    const render = () => {
      harness.cursor = 0
      return MihomoSettingsDrawer({
        targetLabel: 'Mihomo', profile: profile(), managedSettings: { mixedPort: 7890, allowLan: true, ipv6: true },
        dnsResolverCount: 0, onChange: vi.fn(), onManagedChange, onManagedReset,
        onPresetChange: vi.fn(), onClose: vi.fn(),
      })
    }

    const first = render()
    const inputs = findElements(first, (element) => element.type === 'input')
    const port = inputs.find((element) => element.props.type === 'number')
    const checkboxes = inputs.filter((element) => element.props.type === 'checkbox')
    expect(port.props.value).toBe(7890)
    expect(checkboxes.slice(0, 2).map((element) => element.props.checked)).toEqual([true, true])

    port.props.onChange({ target: { value: '70000' } })
    expect(onManagedChange).not.toHaveBeenCalled()
    expect(findElements(render(), (element) => element.type === 'input' && element.props.type === 'number')[0].props['aria-invalid']).toBe(true)
    port.props.onChange({ target: { value: '7999' } })
    checkboxes[0].props.onChange({ target: { checked: false } })
    checkboxes[1].props.onChange({ target: { checked: false } })
    expect(onManagedChange.mock.calls).toEqual([[{ mixedPort: 7999 }], [{ allowLan: false }], [{ ipv6: false }]])

    const resetButtons = findElements(render(), (element) => element.type === 'button' && element.props.className?.includes('workspace-export-settings-reset'))
    expect(resetButtons).toHaveLength(3)
    resetButtons[0].props.onClick()
    resetButtons[1].props.onClick()
    resetButtons[2].props.onClick()
    expect(onManagedReset.mock.calls).toEqual([['mixedPort'], ['allowLan'], ['ipv6']])
  })

  it('displays legacy fallback values and disables reset without implicit migration', async () => {
    harness.state = []
    harness.cursor = 0
    const { MihomoSettingsDrawer } = await import('./WorkspaceTargets')
    const onManagedChange = vi.fn()
    const onManagedReset = vi.fn()
    const rendered = MihomoSettingsDrawer({
      targetLabel: 'Mihomo', profile: profile(), managedSettings: undefined,
      dnsResolverCount: 0, onChange: vi.fn(), onManagedChange, onManagedReset,
      onPresetChange: vi.fn(), onClose: vi.fn(),
    })
    const inputs = findElements(rendered, (element) => element.type === 'input')
    expect(inputs.find((element) => element.props.type === 'number')?.props.value).toBe(7890)
    expect(inputs.filter((element) => element.props.type === 'checkbox').slice(0, 2).map((element) => element.props.checked)).toEqual([true, true])
    const resetButtons = findElements(rendered, (element) => element.type === 'button' && element.props.className?.includes('workspace-export-settings-reset'))
    expect(resetButtons.every((button) => button.props.disabled)).toBe(true)
    expect(onManagedChange).not.toHaveBeenCalled()
    expect(onManagedReset).not.toHaveBeenCalled()
  })
})

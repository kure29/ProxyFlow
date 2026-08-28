import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { I18nProvider } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { SurgeGeneralNetworkEditor } from './Inspector'

const retained = {
  target: 'surge' as const,
  kind: 'general-network' as const,
  ipv6: true,
  ipv6Vif: 'auto' as const,
  icmpForwarding: false,
}

function markup(project: ReturnType<typeof createBlankProject>) {
  const node = project.graph.nodes.find((item) => item.data.blockType === 'output')!
  return renderToStaticMarkup(createElement(
    I18nProvider,
    null,
    createElement(SurgeGeneralNetworkEditor, { node, primaryTarget: node.data.client as 'surge' | 'mihomo' }),
  ))
}

describe('Surge General Network Product UI', () => {
  it('renders editable Default-aware controls for a fresh Surge Output', () => {
    const project = createBlankProject('surge')
    expect(markup(project)).toContain('Surge General · Network / VIF')
    expect(markup(project)).toContain('Surge Default')
    expect(markup(project)).toContain('IPv6 VIF')
    expect(markup(project)).toContain('ICMP forwarding')
    expect(markup(project)).toContain('VIF Route Control')
    expect(markup(project)).toContain('Excluded VIF routes')
  })

  it('preserves explicit values and removes the family only after the last Default choice', () => {
    const project = createBlankProject('surge')
    useBuilderStore.getState().hydrate(project)
    const id = useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')!.id
    useBuilderStore.getState().updateNodeData(id, { targetNativeSurgeGeneralNetwork: { target: 'surge', kind: 'general-network', ipv6: false, ipv6Vif: 'disabled', icmpForwarding: false } })
    expect(useBuilderStore.getState().nodes.find((node) => node.id === id)?.data.targetNativeSurgeGeneralNetwork).toEqual({
      target: 'surge', kind: 'general-network', ipv6: false, ipv6Vif: 'disabled', icmpForwarding: false,
    })
    useBuilderStore.getState().updateNodeData(id, { targetNativeSurgeGeneralNetwork: { target: 'surge', kind: 'general-network', ipv6: false } })
    expect(useBuilderStore.getState().toProject().graph.nodes.find((node) => node.id === id)?.data.targetNativeSurgeGeneralNetwork).toEqual({
      target: 'surge', kind: 'general-network', ipv6: false,
    })
    useBuilderStore.getState().updateNodeData(id, { targetNativeSurgeGeneralNetwork: undefined })
    expect(useBuilderStore.getState().toProject().graph.nodes.find((node) => node.id === id)?.data.targetNativeSurgeGeneralNetwork).toBeUndefined()
  })

  it('retains and exposes Surge intent on non-Surge targets without silently deleting it', () => {
    const project = createBlankProject('mihomo')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = retained
    const html = markup(project)
    expect(html).toContain('Surge General settings are retained')
    expect(html).toContain('These General Network settings are Surge-specific.')
    expect((html.match(/disabled=""/g) ?? []).length).toBe(5)
    expect(output.data.targetNativeSurgeGeneralNetwork).toEqual(retained)
  })

  it('shows malformed retained intent instead of stripping it', () => {
    const project = createBlankProject('mihomo')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = { ...retained, extendedMatching: true } as never
    const html = markup(project)
    expect(html).toContain('Invalid Surge General settings')
    expect(html).toContain('Remove retained settings')
  })

  it('keeps exact values through Surge ↔ Mihomo target switching', () => {
    const project = createBlankProject('surge')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = retained
    useBuilderStore.getState().hydrate(project)
    useBuilderStore.getState().setPrimaryTarget('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.targetNativeSurgeGeneralNetwork).toEqual(retained)
    useBuilderStore.getState().setPrimaryTarget('surge')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.targetNativeSurgeGeneralNetwork).toEqual(retained)
  })

  it('round-trips the optional G1 field through Project serialization and hydration', () => {
    const project = createBlankProject('surge')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = retained
    useBuilderStore.getState().hydrate(project)
    const serialized = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(serialized)
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.targetNativeSurgeGeneralNetwork).toEqual(retained)
  })

  it('renders persisted VIF routes as editable Surge-native multiline controls', () => {
    const project = createBlankProject('surge')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = {
      target: 'surge', kind: 'general-network', ipv6Vif: 'always',
      tunExcludedRoutes: ['10.0.0.0/8', '2001:db8::/32'], tunIncludedRoutes: ['192.168.1.100/32'],
    }
    const html = markup(project)
    expect(html).toContain('10.0.0.0/8\n2001:db8::/32')
    expect(html).toContain('192.168.1.100/32')
  })
})

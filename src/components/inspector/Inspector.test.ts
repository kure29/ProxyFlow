import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import { I18nProvider } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { nextListboxOptionIndex, nextServiceOptionIndex, RoutingInspector } from './Inspector'

describe('Routing Inspector product UI', () => {
  it('does not render the duplicated route relationship box', () => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
    const node = useBuilderStore.getState().nodes.find((item) => item.id === 'ai-services')!
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node })))
    expect(html).not.toContain('route-preview')
    expect(html).not.toContain('route-source')
    expect(html).not.toContain('route-target')
    expect(html).toContain('Target strategy')
  })

  it('supports Arrow, Home, and End navigation over enabled Service options', () => {
    expect(nextListboxOptionIndex('ArrowDown', -1, 6)).toBe(0)
    expect(nextListboxOptionIndex('ArrowDown', 5, 6)).toBe(0)
    expect(nextListboxOptionIndex('ArrowUp', 0, 6)).toBe(5)
    expect(nextListboxOptionIndex('Home', 4, 6)).toBe(0)
    expect(nextListboxOptionIndex('End', 1, 6)).toBe(5)
  })

  it('keeps continuous Service adding focused after already-selected entries', () => {
    const openAiIndex = serviceCatalog.findIndex((service) => service.id === 'openai')
    const netflixIndex = serviceCatalog.findIndex((service) => service.id === 'netflix')
    expect(openAiIndex).toBeGreaterThanOrEqual(0)
    expect(netflixIndex).toBeGreaterThan(openAiIndex)
    expect(nextServiceOptionIndex(serviceCatalog, ['openai'], netflixIndex)).toBe(netflixIndex - 1)
  })
})

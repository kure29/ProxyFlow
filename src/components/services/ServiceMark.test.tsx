import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  getServiceMarkDefinition, serviceMarkDefinitions, serviceMarkIds,
} from './serviceMarkDefinitions'
import { ServiceMark } from './ServiceMark'

describe('ServiceMark', () => {
  it('maps exactly the ten current branded services and excludes legacy China routing', () => {
    expect(serviceMarkIds).toEqual([
      'openai', 'claude', 'google', 'gemini', 'youtube', 'netflix', 'disney', 'telegram', 'github', 'steam',
    ])
    expect(Object.keys(serviceMarkDefinitions)).toHaveLength(10)
    expect(getServiceMarkDefinition('china')).toBeUndefined()
    expect(getServiceMarkDefinition('China Mainland')).toBeUndefined()
  })

  it('keeps the canonical monochrome and fixed-color groups explicit', () => {
    expect(serviceMarkIds.filter((id) => serviceMarkDefinitions[id].mode === 'monochrome')).toEqual([
      'openai', 'youtube', 'disney', 'github', 'steam',
    ])
    expect(serviceMarkIds.filter((id) => serviceMarkDefinitions[id].mode === 'fixed')).toEqual([
      'claude', 'google', 'gemini', 'netflix', 'telegram',
    ])
  })

  it('uses a CSS mask for monochrome marks and a decorative img for fixed-color marks', () => {
    const monochrome = renderToStaticMarkup(createElement(ServiceMark, { serviceId: 'OpenAI' }))
    const fixed = renderToStaticMarkup(createElement(ServiceMark, { serviceId: 'Google' }))
    expect(monochrome).toContain('data-mode="monochrome"')
    expect(monochrome).toContain('service-mark__image--monochrome')
    expect(monochrome).not.toContain('<img')
    expect(fixed).toContain('data-mode="fixed"')
    expect(fixed).toContain('service-mark__image--fixed')
    expect(fixed).toContain('alt=""')
    expect(fixed).not.toMatch(/filter:|opacity:/)
  })

  it('exposes selected badge state without changing decorative accessibility', () => {
    const html = renderToStaticMarkup(createElement(ServiceMark, { serviceId: 'netflix', selected: true }))
    expect(html).toContain('data-selected="true"')
    expect(html).toContain('aria-hidden="true"')
  })
})

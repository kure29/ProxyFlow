import { describe, expect, it } from 'vitest'
import { outputDefinitions, productionOutputDefinitions } from './demoProject'

describe('output definitions', () => {
  it('exposes only release-ready compilers in the intended product order', () => {
    expect(productionOutputDefinitions.map(({ target }) => target)).toEqual(['mihomo', 'surge', 'loon'])
    expect(outputDefinitions.find(({ target }) => target === 'sing-box')?.status).toBe('paused')
    expect(outputDefinitions.find(({ target }) => target === 'surge')?.status).toBe('supported')
    expect(outputDefinitions.find(({ target }) => target === 'loon')?.status).toBe('supported')
    expect(outputDefinitions.some(({ status }) => status !== 'supported')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { outputDefinitions, productionOutputDefinitions } from './demoProject'

describe('output definitions', () => {
  it('keeps only implemented compilers in the production target workflow', () => {
    expect(productionOutputDefinitions.map(({ target }) => target)).toEqual(['mihomo'])
    expect(outputDefinitions.find(({ target }) => target === 'sing-box')?.status).toBe('paused')
    expect(outputDefinitions.find(({ target }) => target === 'surge')?.status).toBe('coming-soon')
    expect(outputDefinitions.find(({ target }) => target === 'loon')?.status).toBe('coming-soon')
    expect(outputDefinitions.some(({ status }) => status !== 'supported')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { outputDefinitions, productionOutputDefinitions } from './demoProject'

describe('output definitions', () => {
  it('keeps only implemented compilers in the production target workflow', () => {
    expect(productionOutputDefinitions.map(({ target }) => target)).toEqual(['mihomo', 'sing-box'])
    expect(outputDefinitions.some(({ status }) => status !== 'supported')).toBe(true)
  })
})

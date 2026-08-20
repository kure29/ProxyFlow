import { describe, expect, it } from 'vitest'
import { serviceCatalog } from './serviceCatalog'

describe('service catalog artwork', () => {
  it('uses the neutral text fallback when verified Claude artwork is unavailable', () => {
    const claude = serviceCatalog.find((service) => service.id === 'claude')

    expect(claude).toMatchObject({ name: 'Claude' })
    expect(claude?.icon).toBeUndefined()
    expect(claude?.iconDark).toBeUndefined()
  })
})

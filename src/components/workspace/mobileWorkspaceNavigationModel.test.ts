import { describe, expect, it } from 'vitest'
import {
  isMoreSection, isNodeSection, resolveMobilePrimarySection, resolveNodeSection,
} from './mobileWorkspaceNavigationModel'

describe('mobile workspace navigation model', () => {
  it('maps every workspace section to one stable primary entry', () => {
    expect(resolveMobilePrimarySection('overview')).toBe('home')
    expect(resolveMobilePrimarySection('sources')).toBe('nodes')
    expect(resolveMobilePrimarySection('proxies')).toBe('nodes')
    expect(resolveMobilePrimarySection('processing')).toBe('nodes')
    expect(resolveMobilePrimarySection('strategies')).toBe('strategies')
    expect(resolveMobilePrimarySection('routing')).toBe('routing')
    expect(resolveMobilePrimarySection('dns')).toBe('more')
    expect(resolveMobilePrimarySection('inspect')).toBe('more')
    expect(resolveMobilePrimarySection('export')).toBe('more')
  })

  it('uses the last node section and falls back to sources', () => {
    expect(resolveNodeSection('routing', 'sources')).toBe('sources')
    expect(resolveNodeSection('routing', 'invalid' as never)).toBe('sources')
    expect(resolveNodeSection('routing')).toBe('sources')
    expect(isNodeSection('processing')).toBe(true)
    expect(isMoreSection('export')).toBe(true)
  })
})

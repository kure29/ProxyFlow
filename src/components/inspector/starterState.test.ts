import { describe, expect, it } from 'vitest'
import { isStarterProject } from './starterState'

const node = (blockType: 'final' | 'output' | 'subscription') => ({ data: { blockType } })

describe('starter project detection', () => {
  it('recognizes the blank Final and Output scaffold', () => {
    expect(isStarterProject([node('final'), node('output')])).toBe(true)
  })

  it('hides starter actions once a source or processing node exists', () => {
    expect(isStarterProject([node('final'), node('output'), node('subscription')])).toBe(false)
  })
})

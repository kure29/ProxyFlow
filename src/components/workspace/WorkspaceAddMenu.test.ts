import { describe, expect, it } from 'vitest'
import { activateWorkspaceCreationOption } from './WorkspaceAddMenu'

describe('Workspace Add menu', () => {
  it('runs the creation callback before closing the menu', () => {
    const sequence: string[] = []
    activateWorkspaceCreationOption(
      { id: 'chain', blockType: 'proxy-chain', advanced: true },
      (type) => sequence.push(`create:${type}`),
      () => sequence.push('close'),
    )
    expect(sequence).toEqual(['create:proxy-chain', 'close'])
  })
})

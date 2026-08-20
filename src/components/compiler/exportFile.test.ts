import { describe, expect, it } from 'vitest'
import { buildTargetExportArtifact, safeFilename } from './exportFile'

describe('target export artifact', () => {
  it('creates target-specific filenames and MIME types only for successful compiles', () => {
    const result = { success: true, content: 'mode: rule\n', issues: [], generatedAt: '2026-01-01T00:00:00.000Z', mock: false }
    expect(buildTargetExportArtifact('My / Project', 'mihomo', result)).toEqual({
      filename: 'My-Project-mihomo.yaml', mimeType: 'text/yaml;charset=utf-8', content: 'mode: rule\n',
    })
    expect(buildTargetExportArtifact('My Project', 'sing-box', { ...result, content: '{}' })?.filename).toBe('My-Project-sing-box.json')
    expect(buildTargetExportArtifact('Blocked', 'mihomo', { ...result, success: false, content: '' })).toBeUndefined()
  })

  it('uses a stable fallback and strips unsafe filename characters', () => {
    expect(safeFilename('   ')).toBe('proxyflow')
    expect(safeFilename('a:b/c')).toBe('a-b-c')
  })
})

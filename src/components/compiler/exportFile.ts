import type { CompileResult } from '../../core/compiler'
import type { PrimaryTarget } from '../../core/capabilities'

const targetFileMeta = {
  mihomo: { extension: 'yaml', mimeType: 'text/yaml;charset=utf-8' },
  'sing-box': { extension: 'json', mimeType: 'application/json;charset=utf-8' },
} as const

export interface TargetExportArtifact {
  filename: string
  mimeType: string
  content: string
}

export function buildTargetExportArtifact(
  projectName: string,
  target: PrimaryTarget,
  result: CompileResult | undefined,
): TargetExportArtifact | undefined {
  if (!result?.success || !result.content) return undefined
  const meta = targetFileMeta[target]
  return {
    filename: `${safeFilename(projectName)}-${target}.${meta.extension}`,
    mimeType: meta.mimeType,
    content: result.content,
  }
}

export function safeFilename(value: string) {
  return value.trim().replaceAll(/[\s\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 72) || 'proxyflow'
}

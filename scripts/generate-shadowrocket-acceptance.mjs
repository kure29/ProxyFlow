#!/usr/bin/env node
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedPath = path.join(root, 'fixtures/shadowrocket/acceptance.expected.conf')
const server = await createServer({ root, configFile: false, envFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false } })
try {
  const acceptance = await server.ssrLoadModule('/src/targets/shadowrocket/acceptance.ts')
  const result = acceptance.compileShadowrocketAcceptance()
  if (!result.success) {
    process.stderr.write(`${result.issues.map((issue) => issue.code).join(',') || 'UNKNOWN'}\n`)
    process.exitCode = 1
  } else {
    if (result.content.includes('\r') || !result.content.endsWith('\n') || result.content.endsWith('\n\n')) throw new Error('SHADOWROCKET_ACCEPTANCE_NON_DETERMINISTIC_NEWLINE')
    const expected = await readFile(expectedPath, 'utf8')
    if (expected !== result.content) throw new Error('SHADOWROCKET_ACCEPTANCE_FIXTURE_DRIFT')
    const counts = acceptance.acceptanceDiagnosticCounts(result)
    const sha256 = createHash('sha256').update(result.content, 'utf8').digest('hex')
    process.stdout.write(`SHADOWROCKET_ACCEPTANCE_OK candidateCount=${counts.candidateCount} compatibleEndpointCount=${counts.compatibleEndpointCount} skippedEndpointCount=${counts.skippedEndpointCount} blockingIssueCount=${counts.blockingIssueCount} sha256=${sha256}\n`)
  }
} finally {
  await server.close()
}

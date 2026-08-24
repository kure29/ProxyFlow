#!/usr/bin/env node
import { createServer } from 'vite'
import { mkdir, readFile, realpath, readdir, writeFile } from 'node:fs/promises'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const fixtureDir = path.join(root, 'fixtures/loon/precedence')
const artifactDir = path.join(root, 'tmp/loon-precedence-acceptance')
const failure = 'LOON_PRECEDENCE_ACCEPTANCE_FAILED\n'
const expectedProfileLines = Object.freeze({
  'local-reject-remote-direct': {
    target: 'https://www.google.com/generate_204',
    rules: ['DOMAIN,www.google.com,REJECT', 'final,DIRECT'],
    remoteRules: ['https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Google.list,policy=DIRECT,enabled=true'],
  },
  'local-direct-remote-reject': {
    target: 'https://www.google.com/generate_204',
    rules: ['DOMAIN,www.google.com,DIRECT', 'final,DIRECT'],
    remoteRules: ['https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Google.list,policy=REJECT,enabled=true'],
  },
  'remote-google-first': {
    target: 'https://generativelanguage.googleapis.com/',
    rules: ['final,DIRECT'],
    remoteRules: [
      'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Google.list,policy=REJECT,enabled=true',
      'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Gemini.list,policy=DIRECT,enabled=true',
    ],
  },
  'remote-gemini-first': {
    target: 'https://generativelanguage.googleapis.com/',
    rules: ['final,DIRECT'],
    remoteRules: [
      'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Gemini.list,policy=DIRECT,enabled=true',
      'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Google.list,policy=REJECT,enabled=true',
    ],
  },
})

async function loadAcceptanceModule() {
  const server = await createServer({
    root,
    configFile: false,
    envFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
  })
  try {
    return await server.ssrLoadModule('/src/targets/loon/precedenceAcceptance.ts')
  } finally {
    await server.close()
  }
}

export function validatePrecedenceArtifact(profile, workspaceRoot = root) {
  const content = profile.content
  const expected = expectedProfileLines[profile.name]
  if (!expected || profile.target !== expected.target) throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_TARGET_INVALID_${profile.name}`)
  if (profile.experiment === 'local-vs-remote' && !profile.name.startsWith('local-')) {
    throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_EXPERIMENT_INVALID_${profile.name}`)
  }
  if (profile.experiment === 'remote-vs-remote' && !profile.name.startsWith('remote-')) {
    throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_EXPERIMENT_INVALID_${profile.name}`)
  }
  if (content.includes('\r') || !content.endsWith('\n') || content.endsWith('\n\n')) {
    throw new Error('LOON_PRECEDENCE_ACCEPTANCE_NEWLINE_INVALID')
  }
  if (content.includes(workspaceRoot)
    || /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content)
    || content.includes('tmp/loon-real-subscription')
    || content.includes('tmp/loon-service-rules')
    || /https:\/\/[^/\s]+@/.test(content)
    || /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(content)) {
    throw new Error('LOON_PRECEDENCE_ACCEPTANCE_PRIVATE_DATA')
  }
  for (const section of ['[General]', '[Proxy]', '[Proxy Group]', '[Rule]', '[Remote Rule]']) {
    if (!content.includes(section)) throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_SECTION_MISSING_${section}`)
  }
  const lines = content.split('\n')
  const sections = new Map()
  const sectionOrder = []
  let currentSection
  for (const line of lines) {
    const section = /^\[([^\]]+)\]$/.exec(line)?.[1]
    if (section) {
      sectionOrder.push(section)
      currentSection = section
      if (sections.has(section)) throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_STRUCTURE_INVALID_${profile.name}`)
      sections.set(section, [])
    } else if (line && currentSection) {
      sections.get(currentSection).push(line)
    }
  }
  if (JSON.stringify(sectionOrder) !== JSON.stringify(['General', 'Proxy', 'Proxy Group', 'Rule', 'Remote Rule'])) {
    throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_SECTION_ORDER_INVALID_${profile.name}`)
  }
  if (JSON.stringify(sections.get('General')) !== '[]'
    || JSON.stringify(sections.get('Proxy')) !== '[]'
    || JSON.stringify(sections.get('Proxy Group')) !== '[]'
    || JSON.stringify(sections.get('Rule')) !== JSON.stringify(expected.rules)
    || JSON.stringify(sections.get('Remote Rule')) !== JSON.stringify(expected.remoteRules)) {
    throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_STRUCTURE_INVALID_${profile.name}`)
  }
  const allowedUrls = new Set([
    'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Google.list',
    'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Gemini.list',
  ])
  for (const line of content.split('\n')) {
    if (!line.startsWith('https://')) continue
    const url = line.split(',', 1)[0]
    if (!allowedUrls.has(url)) throw new Error('LOON_PRECEDENCE_ACCEPTANCE_URL_UNEXPECTED')
  }
  if (!content.includes('final,DIRECT')) throw new Error('LOON_PRECEDENCE_ACCEPTANCE_FINAL_INVALID')
  return content
}

async function assertArtifactDirectory() {
  let stats
  try {
    stats = await lstat(artifactDir)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await mkdir(artifactDir, { recursive: true })
    stats = await lstat(artifactDir)
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('LOON_PRECEDENCE_ACCEPTANCE_ARTIFACT_DIR_INVALID')
  const actualTmp = await realpath(path.dirname(artifactDir))
  if (actualTmp !== path.join(root, 'tmp')) throw new Error('LOON_PRECEDENCE_ACCEPTANCE_ARTIFACT_DIR_ESCAPE')
  const expectedFiles = new Set(Object.keys(expectedProfileLines).map((name) => `${name}.conf`))
  for (const entry of await readdir(artifactDir, { withFileTypes: true })) {
    if (!expectedFiles.has(entry.name) || entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error('LOON_PRECEDENCE_ACCEPTANCE_ARTIFACT_DIR_CONTENT_INVALID')
    }
  }
}

async function writeArtifactFile(directory, name, content) {
  const target = path.join(directory, name)
  try {
    const stats = await lstat(target)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('LOON_PRECEDENCE_ACCEPTANCE_ARTIFACT_FILE_INVALID')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await writeFile(target, content, 'utf8')
}

export async function verifyAndWritePrecedenceArtifacts({
  acceptance,
  workspaceRoot = root,
  updateFixtures = false,
  outputDirectory = artifactDir,
}) {
  const profiles = acceptance.generateLoonPrecedenceProfiles()
  if (profiles.length !== 4) throw new Error('LOON_PRECEDENCE_ACCEPTANCE_PROFILE_COUNT')
  const expectedNames = ['local-reject-remote-direct', 'local-direct-remote-reject', 'remote-google-first', 'remote-gemini-first']
  if (profiles.map(({ name }) => name).join('\0') !== expectedNames.join('\0')) {
    throw new Error('LOON_PRECEDENCE_ACCEPTANCE_PROFILE_NAMES')
  }
  for (const profile of profiles) validatePrecedenceArtifact(profile, workspaceRoot)

  for (const profile of profiles) {
    const fixturePath = path.join(fixtureDir, `${profile.name}.conf`)
    if (updateFixtures) await writeFile(fixturePath, profile.content, 'utf8')
    else {
      const expected = await readFile(fixturePath, 'utf8')
      if (expected !== profile.content) throw new Error(`LOON_PRECEDENCE_ACCEPTANCE_GOLDEN_MISMATCH_${profile.name}`)
    }
  }

  if (outputDirectory === artifactDir) await assertArtifactDirectory()
  else await mkdir(outputDirectory, { recursive: true })
  for (const profile of profiles) {
    await writeArtifactFile(outputDirectory, `${profile.name}.conf`, profile.content)
  }
  return profiles
}

async function main() {
  const acceptance = await loadAcceptanceModule()
  const profiles = await verifyAndWritePrecedenceArtifacts({
    acceptance,
    updateFixtures: process.argv.includes('--update-fixtures'),
  })
  const localRemoteCount = profiles.filter(({ experiment }) => experiment === 'local-vs-remote').length
  const remoteRemoteCount = profiles.filter(({ experiment }) => experiment === 'remote-vs-remote').length
  process.stdout.write(`LOON_PRECEDENCE_ACCEPTANCE_VERIFIED\n`)
  process.stdout.write(`profileCount=${profiles.length}\n`)
  process.stdout.write(`localRemoteProfileCount=${localRemoteCount}\n`)
  process.stdout.write(`remoteRemoteProfileCount=${remoteRemoteCount}\n`)
  process.stdout.write('privateDataRequired=false\n')
  process.stdout.write(`artifactDir=${path.relative(root, artifactDir)}\n`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch(() => {
    process.stderr.write(failure)
    process.exitCode = 1
  })
}

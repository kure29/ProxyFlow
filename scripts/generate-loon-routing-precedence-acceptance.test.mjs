import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolveFirstPartyServiceRuleSource } from '../src/data/serviceRuleAssets.ts'
import {
  LOON_PRECEDENCE_GEMINI_URL,
  LOON_PRECEDENCE_GOOGLE_URL,
  LOON_PRECEDENCE_TARGETS,
  generateLoonPrecedenceProfiles,
} from '../src/targets/loon/precedenceAcceptance.ts'
import { serializeLoonProfile } from '../src/targets/loon/serializer.ts'
import { validatePrecedenceArtifact } from './generate-loon-routing-precedence-acceptance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execFileAsync = promisify(execFile)
const names = ['local-reject-remote-direct', 'local-direct-remote-reject', 'remote-google-first', 'remote-gemini-first']

describe('Loon routing precedence acceptance profiles', () => {
  it('uses the pinned first-party catalog URL shape for both controlled assets', () => {
    expect(resolveFirstPartyServiceRuleSource('google', 'loon')?.url).toBe(LOON_PRECEDENCE_GOOGLE_URL)
    expect(resolveFirstPartyServiceRuleSource('gemini', 'loon')?.url).toBe(LOON_PRECEDENCE_GEMINI_URL)
  })

  it('invokes the configured serializer once for each profile', () => {
    let serializerCalls = 0
    const profiles = generateLoonPrecedenceProfiles((profile) => {
      serializerCalls += 1
      return serializeLoonProfile(profile)
    })
    expect(serializerCalls).toBe(4)
    expect(profiles.map(({ name }) => name)).toEqual(names)
    expect(profiles.every(({ content }) => content.endsWith('\n') && !content.endsWith('\n\n'))).toBe(true)
  })

  it('keeps A as a policy inversion and B as an order-only inversion', () => {
    const profiles = generateLoonPrecedenceProfiles()
    const [localReject, localDirect, googleFirst, geminiFirst] = profiles
    expect(localReject.profile.rules[0]).toEqual({ type: 'DOMAIN', payload: 'www.google.com', policy: 'REJECT' })
    expect(localReject.profile.remoteRules).toEqual([{ url: LOON_PRECEDENCE_GOOGLE_URL, policy: 'DIRECT', enabled: true }])
    expect(localDirect.profile.rules[0]).toEqual({ type: 'DOMAIN', payload: 'www.google.com', policy: 'DIRECT' })
    expect(localDirect.profile.remoteRules).toEqual([{ url: LOON_PRECEDENCE_GOOGLE_URL, policy: 'REJECT', enabled: true }])
    expect(googleFirst.profile.remoteRules).toEqual([
      { url: LOON_PRECEDENCE_GOOGLE_URL, policy: 'REJECT', enabled: true },
      { url: LOON_PRECEDENCE_GEMINI_URL, policy: 'DIRECT', enabled: true },
    ])
    expect(geminiFirst.profile.remoteRules).toEqual([
      { url: LOON_PRECEDENCE_GEMINI_URL, policy: 'DIRECT', enabled: true },
      { url: LOON_PRECEDENCE_GOOGLE_URL, policy: 'REJECT', enabled: true },
    ])
    expect(googleFirst.profile.remoteRules.map(({ url }) => url).reverse()).toEqual(geminiFirst.profile.remoteRules.map(({ url }) => url))
    expect(googleFirst.profile.remoteRules.map(({ policy }) => policy)).toEqual(geminiFirst.profile.remoteRules.map(({ policy }) => policy).reverse())
  })

  it('keeps FINAL DIRECT, public targets, and no private data in every artifact', () => {
    const profiles = generateLoonPrecedenceProfiles()
    expect(profiles.map(({ target }) => target)).toEqual([
      LOON_PRECEDENCE_TARGETS.localRemote,
      LOON_PRECEDENCE_TARGETS.localRemote,
      LOON_PRECEDENCE_TARGETS.remoteRemote,
      LOON_PRECEDENCE_TARGETS.remoteRemote,
    ])
    for (const { content } of profiles) {
      expect(content).toContain('final,DIRECT')
      expect(content).not.toMatch(/tmp\/(?:loon-real-subscription|loon-service-rules)/)
      expect(content).not.toMatch(/https:\/\/[^/\s]+@/)
      expect(content).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
    }
  })

  it('matches checked-in golden bytes and remains deterministic', async () => {
    const first = generateLoonPrecedenceProfiles()
    const second = generateLoonPrecedenceProfiles()
    expect(first.map(({ content }) => content)).toEqual(second.map(({ content }) => content))
    for (const profile of first) {
      const expected = await readFile(path.join(root, 'fixtures/loon/precedence', `${profile.name}.conf`), 'utf8')
      expect(profile.content).toBe(expected)
    }
  })

  it('runs the CLI with fixed safe output and writes all four artifacts', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      'scripts/generate-loon-routing-precedence-acceptance.mjs',
    ], { cwd: root })
    expect(stderr).toBe('')
    expect(stdout).toBe([
      'LOON_PRECEDENCE_ACCEPTANCE_VERIFIED',
      'profileCount=4',
      'localRemoteProfileCount=2',
      'remoteRemoteProfileCount=2',
      'privateDataRequired=false',
      'artifactDir=tmp/loon-precedence-acceptance',
      '',
    ].join('\n'))
    expect(stdout).not.toContain(root)
    expect(stdout).not.toContain('Google.list')
    for (const name of names) {
      const content = await readFile(path.join(root, 'tmp/loon-precedence-acceptance', `${name}.conf`), 'utf8')
      expect(content).toBeTruthy()
      expect(() => validatePrecedenceArtifact({
        name,
        experiment: name.startsWith('local-') ? 'local-vs-remote' : 'remote-vs-remote',
        target: name.startsWith('local-') ? LOON_PRECEDENCE_TARGETS.localRemote : LOON_PRECEDENCE_TARGETS.remoteRemote,
        content,
      })).not.toThrow()
    }
  })
})

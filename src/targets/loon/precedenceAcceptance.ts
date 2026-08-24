import type { LoonProfile, LoonRemoteRule, LoonRule } from './model'
import { serializeLoonProfile } from './serializer'

/**
 * Developer-only profiles for testing Loon precedence in a real client.
 *
 * These profiles intentionally bypass the production compatibility evaluator:
 * the evaluator correctly rejects the unresolved precedence cases represented
 * here. This module is not exported from the Loon target surface.
 */
export const LOON_PRECEDENCE_GOOGLE_URL =
  'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Google.list'
export const LOON_PRECEDENCE_GEMINI_URL =
  'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/Gemini.list'

export const LOON_PRECEDENCE_TARGETS = Object.freeze({
  localRemote: 'https://www.google.com/generate_204',
  remoteRemote: 'https://generativelanguage.googleapis.com/',
})

export const LOON_PRECEDENCE_PROFILE_NAMES = Object.freeze([
  'local-reject-remote-direct',
  'local-direct-remote-reject',
  'remote-google-first',
  'remote-gemini-first',
] as const)

export type LoonPrecedenceProfileName = typeof LOON_PRECEDENCE_PROFILE_NAMES[number]
export type LoonPrecedenceExperiment = 'local-vs-remote' | 'remote-vs-remote'
export type LoonPrecedenceSerializer = (profile: LoonProfile) => string

export interface LoonPrecedenceAcceptanceProfile {
  name: LoonPrecedenceProfileName
  experiment: LoonPrecedenceExperiment
  target: string
  profile: LoonProfile
  content: string
}

const directFinal: LoonRule = { type: 'FINAL', policy: 'DIRECT' }

function remoteRule(url: string, policy: 'DIRECT' | 'REJECT'): LoonRemoteRule {
  return { url, policy, enabled: true }
}

function profile(rules: LoonRule[], remoteRules: LoonRemoteRule[]): LoonProfile {
  return { general: [], proxies: [], proxyGroups: [], rules, remoteRules }
}

function specs(): Array<{
  name: LoonPrecedenceProfileName
  experiment: LoonPrecedenceExperiment
  target: string
  profile: LoonProfile
}> {
  return [
    {
      name: 'local-reject-remote-direct',
      experiment: 'local-vs-remote',
      target: LOON_PRECEDENCE_TARGETS.localRemote,
      profile: profile([
        { type: 'DOMAIN', payload: 'www.google.com', policy: 'REJECT' },
        directFinal,
      ], [remoteRule(LOON_PRECEDENCE_GOOGLE_URL, 'DIRECT')]),
    },
    {
      name: 'local-direct-remote-reject',
      experiment: 'local-vs-remote',
      target: LOON_PRECEDENCE_TARGETS.localRemote,
      profile: profile([
        { type: 'DOMAIN', payload: 'www.google.com', policy: 'DIRECT' },
        directFinal,
      ], [remoteRule(LOON_PRECEDENCE_GOOGLE_URL, 'REJECT')]),
    },
    {
      name: 'remote-google-first',
      experiment: 'remote-vs-remote',
      target: LOON_PRECEDENCE_TARGETS.remoteRemote,
      profile: profile([directFinal], [
        remoteRule(LOON_PRECEDENCE_GOOGLE_URL, 'REJECT'),
        remoteRule(LOON_PRECEDENCE_GEMINI_URL, 'DIRECT'),
      ]),
    },
    {
      name: 'remote-gemini-first',
      experiment: 'remote-vs-remote',
      target: LOON_PRECEDENCE_TARGETS.remoteRemote,
      profile: profile([directFinal], [
        remoteRule(LOON_PRECEDENCE_GEMINI_URL, 'DIRECT'),
        remoteRule(LOON_PRECEDENCE_GOOGLE_URL, 'REJECT'),
      ]),
    },
  ]
}

export function generateLoonPrecedenceProfiles(
  serializer: LoonPrecedenceSerializer = serializeLoonProfile,
): LoonPrecedenceAcceptanceProfile[] {
  return specs().map((spec) => ({ ...spec, content: serializer(spec.profile) }))
}

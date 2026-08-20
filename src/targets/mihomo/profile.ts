import type { CompatibilityIssue, MihomoOutputProfile, MihomoRuntimePreset } from '../../types/project'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'

const PRESETS = new Set(['local-proxy', 'desktop-tun'])
const DNS_MODES = new Set(['disabled', 'redir-host', 'fake-ip'])
const TUN_STACKS = new Set(['mixed', 'system', 'gvisor'])
const BOOLEAN_FIELDS = [
  'allowLan', 'ipv6', 'strictRoute', 'sniffer', 'storeSelected', 'unifiedDelay', 'tcpConcurrent',
] as const
const PROFILE_FIELDS = new Set(['preset', 'mixedPort', 'dnsMode', 'tunStack', ...BOOLEAN_FIELDS])

export function createMihomoOutputProfile(preset: MihomoRuntimePreset = 'local-proxy'): MihomoOutputProfile {
  return {
    preset,
    mixedPort: MIHOMO_DEFAULTS.mixedPort,
    allowLan: false,
    ipv6: true,
    dnsMode: preset === 'desktop-tun' ? 'fake-ip' : 'redir-host',
    tunStack: 'mixed',
    strictRoute: false,
    sniffer: preset === 'desktop-tun',
    storeSelected: true,
    unifiedDelay: true,
    tcpConcurrent: true,
  }
}

export function resolveMihomoOutputProfile(value: unknown): MihomoOutputProfile {
  return normalizeMihomoOutputProfile(value).profile
}

export function validateMihomoOutputProfile(
  value: unknown,
  dnsEnabled: boolean,
  entityId?: string,
): { profile: MihomoOutputProfile; issues: CompatibilityIssue[] } {
  const normalized = normalizeMihomoOutputProfile(value)
  const issues: CompatibilityIssue[] = []
  if (normalized.invalidField) {
    issues.push(mihomoIssue(
      'MIHOMO_PROFILE_INVALID',
      'error',
      'output-profile',
      'The Mihomo output profile contains an invalid setting.',
      entityId,
    ))
  }
  if (normalized.invalidPort) {
    issues.push(mihomoIssue(
      'MIHOMO_MIXED_PORT_INVALID',
      'error',
      'output-profile',
      'Mihomo mixed port must be an integer between 1 and 65535.',
      entityId,
    ))
  }
  if (normalized.profile.preset === 'desktop-tun' && normalized.profile.dnsMode !== 'fake-ip') {
    issues.push(mihomoIssue(
      'MIHOMO_TUN_FAKE_IP_REQUIRED',
      'error',
      'output-profile',
      'The Desktop TUN preset requires Fake-IP DNS mode.',
      entityId,
    ))
  }
  if (normalized.profile.preset === 'desktop-tun' && !dnsEnabled) {
    issues.push(mihomoIssue(
      'MIHOMO_TUN_DNS_REQUIRED',
      'error',
      'output-profile',
      'The Desktop TUN preset requires an enabled DNS node in the project.',
      entityId,
    ))
  }
  if (value !== undefined && normalized.profile.preset !== 'desktop-tun'
    && normalized.profile.dnsMode !== 'disabled' && !dnsEnabled) {
    issues.push(mihomoIssue(
      'MIHOMO_DNS_PROFILE_REQUIRES_DNS',
      'error',
      'output-profile',
      'The selected Mihomo DNS enhancement mode requires an enabled DNS node in the project.',
      entityId,
    ))
  }
  return { profile: normalized.profile, issues }
}

function normalizeMihomoOutputProfile(value: unknown) {
  if (value === undefined) return { profile: createMihomoOutputProfile(), invalidField: false, invalidPort: false }
  if (!isRecord(value)) return { profile: createMihomoOutputProfile(), invalidField: true, invalidPort: false }

  let invalidField = false
  let invalidPort = false
  if (Object.keys(value).some((field) => !PROFILE_FIELDS.has(field))) invalidField = true
  const preset = typeof value.preset === 'string' && PRESETS.has(value.preset)
    ? value.preset as MihomoRuntimePreset
    : 'local-proxy'
  if ('preset' in value && preset !== value.preset) invalidField = true
  const profile = createMihomoOutputProfile(preset)

  if ('mixedPort' in value) {
    if (Number.isInteger(value.mixedPort) && Number(value.mixedPort) >= 1 && Number(value.mixedPort) <= 65535) {
      profile.mixedPort = Number(value.mixedPort)
    } else {
      if (typeof value.mixedPort === 'number' && Number.isFinite(value.mixedPort)) profile.mixedPort = value.mixedPort
      invalidPort = true
    }
  }
  if ('dnsMode' in value) {
    if (typeof value.dnsMode === 'string' && DNS_MODES.has(value.dnsMode)) profile.dnsMode = value.dnsMode as MihomoOutputProfile['dnsMode']
    else invalidField = true
  }
  if ('tunStack' in value) {
    if (typeof value.tunStack === 'string' && TUN_STACKS.has(value.tunStack)) profile.tunStack = value.tunStack as MihomoOutputProfile['tunStack']
    else invalidField = true
  }
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in value)) continue
    if (typeof value[field] === 'boolean') profile[field] = value[field]
    else invalidField = true
  }

  return { profile, invalidField, invalidPort }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

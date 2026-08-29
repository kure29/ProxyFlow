import type { CompatibilityIssue, MihomoTargetSettings } from '../../types/project'
import { mihomoIssue } from './errors'

const SETTINGS_FIELDS = new Set(['mixedPort', 'allowLan', 'ipv6'])

export type MihomoTargetSettingsPatch = Partial<MihomoTargetSettings>
export type MihomoTargetSettingsField = keyof MihomoTargetSettings

export interface EffectiveMihomoTargetSettings {
  mixedPort: number
  allowLan: boolean
  ipv6: boolean
}

export interface MihomoTargetSettingsValidation {
  settings: MihomoTargetSettings
  issues: CompatibilityIssue[]
}

/**
 * Resolve the one compiler-visible target setting value. Managed Project
 * settings are canonical; the legacy Output profile is a compatibility
 * fallback, and its normalized defaults are the final fallback.
 */
export function resolveMihomoEffectiveTargetSettings(
  managed: MihomoTargetSettings | undefined,
  fallback: EffectiveMihomoTargetSettings,
): EffectiveMihomoTargetSettings {
  return {
    mixedPort: managed?.mixedPort ?? fallback.mixedPort,
    allowLan: managed?.allowLan ?? fallback.allowLan,
    ipv6: managed?.ipv6 ?? fallback.ipv6,
  }
}

/**
 * Resolve the values shown by the Mihomo settings UI without persisting any
 * fallback. Nullish semantics preserve an explicit false value while allowing
 * an omitted managed field to inherit the legacy profile/default.
 */
export function resolveMihomoTargetSettingsDisplay(
  managed: unknown,
  fallback: EffectiveMihomoTargetSettings,
): EffectiveMihomoTargetSettings {
  const normalized = validateMihomoTargetSettings(managed).settings
  return resolveMihomoEffectiveTargetSettings(normalized, fallback)
}

/** Apply a target-scoped patch; undefined explicitly removes a managed field. */
export function mergeMihomoTargetSettings(
  current: MihomoTargetSettings | undefined,
  patch: MihomoTargetSettingsPatch,
): MihomoTargetSettings | undefined {
  const next: MihomoTargetSettings = { ...current }
  if ('mixedPort' in patch) {
    if (patch.mixedPort === undefined) delete next.mixedPort
    else next.mixedPort = patch.mixedPort
  }
  if ('allowLan' in patch) {
    if (patch.allowLan === undefined) delete next.allowLan
    else next.allowLan = patch.allowLan
  }
  if ('ipv6' in patch) {
    if (patch.ipv6 === undefined) delete next.ipv6
    else next.ipv6 = patch.ipv6
  }
  return Object.keys(next).length ? next : undefined
}

export function isMihomoTargetSettingManaged(value: unknown, field: MihomoTargetSettingsField) {
  return isRecord(value) && field in value && value[field] !== undefined
}

/** Validate only the managed Mihomo settings owned by this target branch. */
export function validateMihomoTargetSettings(value: unknown, entityId = 'mihomo-settings'): MihomoTargetSettingsValidation {
  if (value === undefined) return { settings: {}, issues: [] }
  if (!isRecord(value)) return {
    settings: {},
    issues: [mihomoIssue(
      'MIHOMO_TARGET_SETTINGS_INVALID', 'error', 'target-settings',
      'Mihomo target settings must be an object.', entityId,
    )],
  }

  const issues: CompatibilityIssue[] = []
  if (Object.keys(value).some((field) => !SETTINGS_FIELDS.has(field))) {
    issues.push(mihomoIssue(
      'MIHOMO_TARGET_SETTINGS_INVALID', 'error', 'target-settings',
      'Mihomo target settings contain an unknown field.', entityId,
    ))
  }

  const settings: MihomoTargetSettings = {}
  if ('mixedPort' in value) {
    if (Number.isInteger(value.mixedPort) && Number(value.mixedPort) >= 1 && Number(value.mixedPort) <= 65_535) settings.mixedPort = Number(value.mixedPort)
    else issues.push(mihomoIssue(
      'MIHOMO_TARGET_SETTINGS_MIXED_PORT_INVALID', 'error', 'target-settings',
      'Mihomo mixed port must be an integer between 1 and 65535.', entityId,
    ))
  }
  for (const field of ['allowLan', 'ipv6'] as const) {
    if (field in value) {
      if (typeof value[field] === 'boolean') settings[field] = value[field]
      else issues.push(mihomoIssue(
        'MIHOMO_TARGET_SETTINGS_INVALID', 'error', 'target-settings',
        `Mihomo ${field} must be a boolean.`, entityId,
      ))
    }
  }
  return { settings, issues }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

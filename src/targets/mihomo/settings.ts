import type { CompatibilityIssue, MihomoTargetSettings } from '../../types/project'
import { mihomoIssue } from './errors'

const SETTINGS_FIELDS = new Set(['mixedPort', 'allowLan', 'ipv6'])

export interface MihomoTargetSettingsValidation {
  settings: MihomoTargetSettings
  issues: CompatibilityIssue[]
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

import type { CompatibilityIssue } from '../../types/project'

export function mihomoIssue(
  code: string,
  severity: CompatibilityIssue['severity'],
  feature: string,
  message: string,
  entityId?: string,
): CompatibilityIssue {
  return { target: 'mihomo', code, severity, feature, message, entityId }
}

import type { CompatibilityIssue } from '../../types/project'

export function singBoxIssue(
  code: string,
  severity: CompatibilityIssue['severity'],
  feature: string,
  message: string,
  entityId?: string,
): CompatibilityIssue {
  return { target: 'sing-box', code, severity, feature, message, ...(entityId ? { entityId } : {}) }
}

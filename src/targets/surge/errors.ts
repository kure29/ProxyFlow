import type { CompatibilityIssue } from '../../types/project'

export function surgeIssue(
  code: string,
  severity: CompatibilityIssue['severity'],
  feature: string,
  message: string,
  entityId?: string,
): CompatibilityIssue {
  return { target: 'surge', code, severity, feature, message, entityId }
}

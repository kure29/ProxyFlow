import type { CompatibilityIssue } from '../../types/project'

export function shadowrocketIssue(
  code: string,
  severity: CompatibilityIssue['severity'],
  feature: string,
  message: string,
  entityId?: string,
): CompatibilityIssue {
  return { target: 'shadowrocket', code, severity, feature, message, entityId }
}


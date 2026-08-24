import type { CompatibilityIssue } from '../../types/project'

/** Construct a target-scoped diagnostic without leaking another compiler's codes. */
export function loonIssue(
  code: string,
  severity: CompatibilityIssue['severity'],
  feature: string,
  message: string,
  entityId?: string,
): CompatibilityIssue {
  return { target: 'loon', code, severity, feature, message, entityId }
}

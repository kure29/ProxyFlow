export interface StructuredDiagnostic {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  entityId?: string
  nodeId?: string
  entity?: { id: string }
}

export interface GroupedDiagnostic<T extends StructuredDiagnostic> {
  issue: T
  count: number
}

export function diagnosticNodeId(issue: StructuredDiagnostic, availableNodeIds: ReadonlySet<string>) {
  for (const candidate of [issue.entityId, issue.nodeId, issue.entity?.id]) {
    if (candidate && availableNodeIds.has(candidate)) return candidate
  }
  return undefined
}

export function groupDiagnostics<T extends StructuredDiagnostic>(issues: readonly T[]): GroupedDiagnostic<T>[] {
  const grouped: GroupedDiagnostic<T>[] = []
  const indexByKey = new Map<string, number>()
  for (const issue of issues) {
    const key = diagnosticKey(issue)
    const existing = indexByKey.get(key)
    if (existing !== undefined) grouped[existing].count += 1
    else {
      indexByKey.set(key, grouped.length)
      grouped.push({ issue, count: 1 })
    }
  }
  return grouped
}

export function deduplicateDiagnostics<T extends StructuredDiagnostic>(issues: readonly T[]) {
  return groupDiagnostics(issues).map(({ issue }) => issue)
}

function diagnosticKey(issue: StructuredDiagnostic) {
  return [issue.severity, issue.code, issue.entityId ?? issue.nodeId ?? issue.entity?.id ?? '', issue.message].join('\u0000')
}

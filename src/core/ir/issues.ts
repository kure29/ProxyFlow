export type SemanticIssueSeverity = 'info' | 'warning' | 'error'
export type SemanticIssueStage = 'graph' | 'compile' | 'ir'

export interface SemanticIssue {
  code: string
  severity: SemanticIssueSeverity
  stage: SemanticIssueStage
  message: string
  entity?: {
    type: string
    id: string
  }
  nodeId?: string
}

export function semanticIssue(
  code: string,
  severity: SemanticIssueSeverity,
  stage: SemanticIssueStage,
  message: string,
  options: Pick<SemanticIssue, 'entity' | 'nodeId'> = {},
): SemanticIssue {
  return { code, severity, stage, message, ...options }
}

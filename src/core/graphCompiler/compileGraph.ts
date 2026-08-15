import type { ProxyFlowProject } from '../../types/project'
import { PROXYFLOW_IR_VERSION, semanticIssue, type ProxyFlowIR, type SemanticIssue } from '../ir'
import { validateIR } from '../semanticValidation'
import { compileDns, compileOutputs } from './compileInfrastructure'
import { compileRouting } from './compileRouting'
import { compileSources } from './compileSources'
import { compileStrategies } from './compileStrategies'
import { compileTransforms } from './compileTransforms'
import { createGraphCompileContext } from './context'
import { validateGraphStructure } from './validateGraphStructure'

export interface GraphCompileResult {
  ir?: ProxyFlowIR
  issues: SemanticIssue[]
  success: boolean
}

export function compileGraph(project: ProxyFlowProject): GraphCompileResult {
  try {
    const context = createGraphCompileContext(project)
    context.issues.push(...validateGraphStructure(project))
    const routing = compileRouting(context)
    const draft: ProxyFlowIR = {
      version: PROXYFLOW_IR_VERSION,
      metadata: {
        projectId: project.id,
        projectName: project.name,
        projectSchemaVersion: project.version,
      },
      sources: compileSources(context),
      transforms: compileTransforms(context),
      strategies: compileStrategies(context),
      services: project.services.map((service) => ({
        id: service.id,
        name: service.name,
        defaultMatchers: service.defaultMatchers,
        ruleSources: service.ruleSources.map(({ id, provider, format, behavior, url }) => ({
          id,
          provider,
          ...(format ? { format } : {}),
          ...(behavior ? { behavior } : {}),
          ...(url ? { url } : {}),
        })),
      })),
      routes: routing.routes,
      finalRoute: routing.finalRoute,
      dns: compileDns(context),
      outputs: compileOutputs(context),
    }
    const issues = deduplicateIssues([...context.issues, ...validateIR(draft)])
    const success = !issues.some((issue) => issue.severity === 'error')
    return { success, issues, ir: success ? draft : undefined }
  } catch (error) {
    return {
      success: false,
      issues: [semanticIssue(
        'GRAPH_COMPILE_INTERNAL_ERROR',
        'error',
        'compile',
        error instanceof Error ? error.message : 'Unexpected graph compilation failure.',
      )],
    }
  }
}

function deduplicateIssues(issues: SemanticIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = [issue.code, issue.stage, issue.nodeId, issue.entity?.type, issue.entity?.id, issue.message].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

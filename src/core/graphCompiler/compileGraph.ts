import type { ProxyFlowProject } from '../../types/project'
import { PROXYFLOW_IR_VERSION, semanticIssue, type ProxyFlowIR, type SemanticIssue } from '../ir'
import { validateIR } from '../semanticValidation'
import { compileDns, compileOutputs } from './compileInfrastructure'
import { compileRouting } from './compileRouting'
import { compileSources } from './compileSources'
import { compileStrategies } from './compileStrategies'
import { compileTransforms } from './compileTransforms'
import { createGraphCompileContext } from './context'
import type { GraphCompileOptions } from './context'
import { validateGraphStructure } from './validateGraphStructure'
import { ruleSourceMatchersToIR, validateCustomRuleSourceForTarget } from '../routing/customRuleSource'

export interface GraphCompileResult {
  ir?: ProxyFlowIR
  issues: SemanticIssue[]
  success: boolean
}

export function compileGraph(project: ProxyFlowProject, options: GraphCompileOptions = {}): GraphCompileResult {
  try {
    const context = createGraphCompileContext(project, options)
    context.issues.push(...validateGraphStructure(project))
    const customRuleSourceServices = project.graph.nodes.flatMap((node) => {
      if (node.data.disabled || node.data.blockType !== 'custom-rule' || node.data.routeMatcherKind !== 'rule-set') return []
      const source = node.data.customRuleSource
      if (!source) return []
      const inlineMatchers = ruleSourceMatchersToIR(source)
      if (!inlineMatchers) {
        context.addIssue(semanticIssue(
          'RULE_SOURCE_NORMALIZED_MODEL_INVALID', 'error', 'compile', `Rule source "${source.name}" contains an invalid normalized matcher.`,
          { nodeId: node.id, entity: { type: 'rule-set', id: source.id } },
        ))
        return []
      }
      const validationTarget = options.validationTarget === undefined ? project.primaryTarget : options.validationTarget
      if (validationTarget) for (const issue of validateCustomRuleSourceForTarget(source, validationTarget)) context.addIssue(semanticIssue(
        issue.code, issue.severity, 'compile', issue.message,
        { nodeId: node.id, entity: { type: 'rule-set', id: source.id } },
      ))
      return [{
        id: `custom-rule-source:${source.id}`,
        name: source.name,
        ruleSources: [{
          id: source.id,
          provider: 'custom' as const,
          format: source.format === 'mihomo-yaml' ? 'yaml' as const : 'text' as const,
          behavior: 'classical' as const,
          inlineMatchers,
        }],
      }]
    })
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
      services: [...project.services.map((service) => ({
        id: service.id,
        name: service.name,
        defaultMatchers: service.defaultMatchers,
        ...(service.inlineMatchers?.length ? { inlineMatchers: service.inlineMatchers } : {}),
        ruleSources: service.ruleSources.map(({ id, provider, format, behavior, url }) => ({
          id,
          provider,
          ...(format ? { format } : {}),
          ...(behavior ? { behavior } : {}),
          ...(url ? { url } : {}),
        })),
      })), ...customRuleSourceServices],
      routes: routing.routes,
      finalRoute: routing.finalRoute,
      dns: compileDns(context),
      outputs: compileOutputs(context),
    }
    const issues = deduplicateIssues([...context.issues, ...validateIR(draft)])
    const success = !issues.some((issue) => issue.severity === 'error')
    return { success, issues, ir: success || options.retainDraftOnErrorForDiagnostics ? draft : undefined }
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

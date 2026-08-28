import type { ProxyFlowProject } from '../../types/project'
import { PROXYFLOW_IR_VERSION, semanticIssue, type ProxyFlowIR, type SemanticIssue } from '../ir'
import { validateIR } from '../semanticValidation'
import { compileDns, compileOutputs } from './compileInfrastructure'
import { compileRouting } from './compileRouting'
import { compileSources } from './compileSources'
import { compileStrategies } from './compileStrategies'
import { compileTargetNativeStrategies } from './compileTargetNativeStrategies'
import { compileTargetNativeRuleSetSources } from './compileTargetNativeRuleSets'
import { compileTargetNativeFinalOptions } from './compileTargetNativeFinalOptions'
import { compileTargetNativeRouteOptions } from './compileTargetNativeRouteOptions'
import { compileTargetNativeSurgeGeneralNetworks, validateTargetNativeSurgeGeneralNetworkOutputSelection } from './compileTargetNativeGeneralNetwork'
import { compileTargetNativeSurgeGeneralConnectivity, validateTargetNativeSurgeGeneralConnectivityOutputSelection } from './compileTargetNativeGeneralConnectivity'
import { compileTransforms } from './compileTransforms'
import { createGraphCompileContext } from './context'
import type { GraphCompileOptions } from './context'
import { validateGraphStructure } from './validateGraphStructure'
import { ruleSourceMatchersToIR, validateCustomRuleSourceForTarget } from '../routing/customRuleSource'

export interface GraphCompileResult {
  ir?: ProxyFlowIR
  /** Target-native semantics are an extension to Universal IR, never IR strategies. */
  nativeStrategies?: import('../targetNative').TargetNativeStrategyIR[]
  /** Descriptive alias for integrations that call the extension target-native strategies. */
  targetNativeStrategies?: import('../targetNative').TargetNativeStrategyIR[]
  nativeRuleSetSources?: import('../targetNative').TargetNativeRuleSetSourceIR[]
  targetNativeRuleSetSources?: import('../targetNative').TargetNativeRuleSetSourceIR[]
  nativeRoutes?: import('../targetNative').TargetNativeRouteIR[]
  nativeFinalRoute?: import('../targetNative').TargetNativeFinalRouteIR
  /** Compiler-owned Project Final node identity used by target adapters. */
  effectiveFinalNodeId?: string
  targetNativeFinalOptions?: import('../targetNative').TargetNativeFinalOptionsIR
  targetNativeRouteOptions?: import('../targetNative').TargetNativeRouteOptionsIR[]
  /** Output-owned Surge General Network/VIF extensions. */
  targetNativeSurgeGeneralNetworks?: import('../targetNative').TargetNativeSurgeGeneralNetworkIR[]
  /** Singular convenience value when exactly one effective record exists. */
  targetNativeSurgeGeneralNetwork?: import('../targetNative').TargetNativeSurgeGeneralNetworkIR
  /** Output-owned Surge Internet/DIRECT connectivity extensions. */
  targetNativeSurgeGeneralConnectivityRecords?: import('../targetNative').TargetNativeSurgeGeneralConnectivityIR[]
  targetNativeSurgeGeneralConnectivity?: import('../targetNative').TargetNativeSurgeGeneralConnectivityIR
  issues: SemanticIssue[]
  success: boolean
}

export function compileGraph(project: ProxyFlowProject, options: GraphCompileOptions = {}): GraphCompileResult {
  try {
    const context = createGraphCompileContext(project, options)
    context.issues.push(...validateGraphStructure(project))
    const customRuleSourceServices: ProxyFlowIR['services'] = project.graph.nodes.flatMap((node): ProxyFlowIR['services'] => {
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
    const validationTarget = options.validationTarget === undefined ? project.primaryTarget : options.validationTarget
    const routing = compileRouting(context, validationTarget)
    const targetNativeFinalOptions = compileTargetNativeFinalOptions(context, routing.effectiveFinalNodeId, validationTarget)
    const targetNativeRouteOptions = compileTargetNativeRouteOptions(context, validationTarget)
    const targetNativeSurgeGeneralNetworks = compileTargetNativeSurgeGeneralNetworks(context)
    validateTargetNativeSurgeGeneralNetworkOutputSelection(context, targetNativeSurgeGeneralNetworks, validationTarget)
    const targetNativeSurgeGeneralConnectivityRecords = compileTargetNativeSurgeGeneralConnectivity(context)
    validateTargetNativeSurgeGeneralConnectivityOutputSelection(context, targetNativeSurgeGeneralConnectivityRecords, validationTarget)
    const nativeStrategies = compileTargetNativeStrategies(context, validationTarget)
    const nativeRuleSetSources = compileTargetNativeRuleSetSources(context, validationTarget)
    const targetNativeRuleSetServices: ProxyFlowIR['services'] = []
    const knownRuleSourceIds = new Set([
      ...project.services.flatMap((service) => service.ruleSources.map((source) => source.id)),
      ...customRuleSourceServices.flatMap((service) => service.ruleSources.map((source) => source.id)),
    ])
    const syntheticRuleSourceIds = new Set<string>()
    for (const node of project.graph.nodes) {
      if (node.data.disabled || node.data.routeMatcherKind !== 'rule-set') continue
      if (node.data.customRuleSource || !node.data.targetNativeRuleSet) continue
      const sourceId = node.data.routeMatcherValue?.trim()
      if (!sourceId) continue
      if (knownRuleSourceIds.has(sourceId) || syntheticRuleSourceIds.has(sourceId)) continue
      syntheticRuleSourceIds.add(sourceId)
      targetNativeRuleSetServices.push({
        id: `target-native-rule-set:${sourceId}`,
        name: `Built-in Rule Set ${sourceId}`,
        ruleSources: [{ id: sourceId, provider: 'builtin' as const }],
      })
    }
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
      })), ...customRuleSourceServices, ...targetNativeRuleSetServices],
      routes: routing.routes,
      finalRoute: routing.finalRoute,
      dns: compileDns(context),
      outputs: compileOutputs(context),
    }
    const issues = deduplicateIssues([
      ...context.issues,
      ...validateIR(draft).filter((issue) => !(issue.code === 'FINAL_MISSING' && routing.nativeFinalRoute)),
    ])
    const success = !issues.some((issue) => issue.severity === 'error')
    return {
      success,
      issues,
      nativeStrategies,
      targetNativeStrategies: nativeStrategies,
      nativeRuleSetSources,
      targetNativeRuleSetSources: nativeRuleSetSources,
      nativeRoutes: routing.nativeRoutes,
      nativeFinalRoute: routing.nativeFinalRoute,
      effectiveFinalNodeId: routing.effectiveFinalNodeId,
      targetNativeFinalOptions,
      targetNativeRouteOptions,
      targetNativeSurgeGeneralNetworks,
      ...(targetNativeSurgeGeneralNetworks.length === 1
        ? { targetNativeSurgeGeneralNetwork: targetNativeSurgeGeneralNetworks[0] }
        : {}),
      targetNativeSurgeGeneralConnectivityRecords,
      ...(targetNativeSurgeGeneralConnectivityRecords.length === 1
        ? { targetNativeSurgeGeneralConnectivity: targetNativeSurgeGeneralConnectivityRecords[0] }
        : {}),
      ir: success || options.retainDraftOnErrorForDiagnostics ? draft : undefined,
    }
  } catch (error) {
    return {
      success: false,
      nativeStrategies: [],
      targetNativeStrategies: [],
      nativeRuleSetSources: [],
      targetNativeRuleSetSources: [],
      nativeRoutes: [],
      effectiveFinalNodeId: undefined,
      targetNativeFinalOptions: undefined,
      targetNativeRouteOptions: [],
      targetNativeSurgeGeneralNetworks: [],
      targetNativeSurgeGeneralNetwork: undefined,
      targetNativeSurgeGeneralConnectivityRecords: [],
      targetNativeSurgeGeneralConnectivity: undefined,
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

import type { StrategyIR } from '../../core/ir'
import type { SingBoxCompileContext, SingBoxStrategyTemplate } from './context'
import { SINGBOX_DEFAULTS } from './defaults'
import { singBoxIssue } from './errors'
import { resolveSingBoxProxySet } from './outbounds'

export function compileSingBoxStrategies(context: SingBoxCompileContext) {
  for (const strategy of context.ir.strategies) {
    if (strategy.kind !== 'chain') compileStrategy(strategy, context, [])
  }
}

function compileStrategy(
  strategy: Exclude<StrategyIR, { kind: 'chain' }>,
  context: SingBoxCompileContext,
  stack: string[],
): SingBoxStrategyTemplate | undefined {
  const existing = context.strategyTemplates.get(strategy.id)
  if (existing) return existing
  if (stack.includes(strategy.id)) {
    context.issues.push(singBoxIssue(
      'SINGBOX_STRATEGY_CYCLE', 'error', 'strategy', `Strategy cycle detected: ${[...stack, strategy.id].join(' → ')}.`, strategy.id,
    ))
    return undefined
  }
  if (strategy.kind === 'fallback' || strategy.kind === 'load-balance') return undefined
  const tag = context.strategyTags.get(strategy.id)!

  if (strategy.kind === 'fixed') {
    const proxyTag = strategy.proxyId ? context.endpointTags.get(strategy.proxyId) : undefined
    if (!proxyTag || !context.outbounds.has(proxyTag)) {
      context.issues.push(singBoxIssue(
        'SINGBOX_INVALID_OUTBOUND', 'error', 'strategy', `Fixed strategy “${strategy.name}” 没有已解析 outbound。`, strategy.id,
      ))
      return undefined
    }
    const template: SingBoxStrategyTemplate = { kind: 'fixed', tag: proxyTag, memberTags: [proxyTag] }
    context.strategyTemplates.set(strategy.id, template)
    return template
  }

  if (strategy.kind === 'auto-select') {
    const memberTags = unique(resolveSingBoxProxySet(strategy.source, context).map((item) => item.tag))
    if (memberTags.length === 0) return emptyStrategy(strategy, context)
    context.outbounds.set(tag, {
      type: 'urltest', tag, outbounds: memberTags,
      url: strategy.healthCheck?.url ?? SINGBOX_DEFAULTS.healthCheckUrl,
      interval: `${strategy.healthCheck?.intervalSeconds ?? SINGBOX_DEFAULTS.healthCheckIntervalSeconds}s`,
      tolerance: strategy.healthCheck?.toleranceMs ?? SINGBOX_DEFAULTS.healthCheckToleranceMs,
    })
    const template: SingBoxStrategyTemplate = { kind: 'urltest', tag, memberTags }
    context.strategyTemplates.set(strategy.id, template)
    return template
  }

  const memberTags = unique(strategy.candidates.flatMap((candidate): string[] => {
    if (candidate.kind !== 'strategy') return resolveSingBoxProxySet(candidate, context).map((item) => item.tag)
    const nested = context.ir.strategies.find((item) => item.id === candidate.id)
    if (!nested || nested.kind === 'chain') return []
    const template = compileStrategy(nested, context, [...stack, strategy.id])
    return template ? [template.tag] : []
  }))
  if (memberTags.length === 0) return emptyStrategy(strategy, context)
  context.outbounds.set(tag, { type: 'selector', tag, outbounds: memberTags, default: memberTags[0] })
  const template: SingBoxStrategyTemplate = { kind: 'selector', tag, memberTags }
  context.strategyTemplates.set(strategy.id, template)
  return template
}

function emptyStrategy(strategy: StrategyIR, context: SingBoxCompileContext) {
  context.issues.push(singBoxIssue(
    'SINGBOX_STRATEGY_EMPTY', 'error', 'strategy', `Strategy “${strategy.name}” 没有可 materialize 的 outbound。`, strategy.id,
  ))
  return undefined
}

const unique = (values: string[]) => [...new Set(values)]

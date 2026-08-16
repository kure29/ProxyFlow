import type { HealthCheckIR, StrategyCandidateRef, StrategyIR } from '../../core/ir'
import type { CompiledGroupTemplate, MihomoCompileContext, ResolvedProxySet } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'
import type { MihomoProxyGroup } from './model'
import { filtersForProxySet, resolveProxySet } from './providers'

export function compileMihomoStrategies(context: MihomoCompileContext) {
  for (const strategy of context.ir.strategies) {
    if (strategy.kind === 'chain') continue
    if (strategy.kind === 'fixed') {
      const proxyName = strategy.proxyId ? context.proxyNamesById.get(strategy.proxyId) : undefined
      if (!proxyName || !context.proxies.has(proxyName)) {
        context.issues.push(mihomoIssue(
          'MIHOMO_FIXED_PROXY_UNRESOLVED', 'error', 'strategy',
          `Fixed strategy “${strategy.name}” 没有可解析的 HTTP/SOCKS endpoint。`, strategy.id,
        ))
        continue
      }
      const group: MihomoProxyGroup = { name: context.strategyNames.get(strategy.id)!, type: 'select', proxies: [proxyName] }
      context.groups.push(group)
      context.groupTemplates.set(strategy.id, { group, providerNames: [], proxyNames: [proxyName] })
      continue
    }
    const template = compileStrategy(strategy, context)
    if (!template) continue
    context.groups.push(template.group)
    context.groupTemplates.set(strategy.id, template)
  }
}

function compileStrategy(
  strategy: Exclude<StrategyIR, { kind: 'chain' | 'fixed' }>,
  context: MihomoCompileContext,
): CompiledGroupTemplate | undefined {
  const name = context.strategyNames.get(strategy.id)!

  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') {
    const resolved = resolveProxySet(strategy.source, context)
    if (!ensureMembers(resolved, strategy, context)) return undefined
    const group: MihomoProxyGroup = {
      name,
      type: strategy.kind === 'auto-select' ? 'url-test' : 'load-balance',
      ...(resolved.providers.length > 0 ? { use: resolved.providers } : {}),
      ...(resolved.proxyNames.length > 0 ? { proxies: resolved.proxyNames } : {}),
      ...filtersForProxySet(resolved),
      ...healthFields(strategy.kind === 'auto-select' ? strategy.healthCheck : undefined),
      ...(strategy.kind === 'auto-select' && strategy.healthCheck?.toleranceMs !== undefined
        ? { tolerance: strategy.healthCheck.toleranceMs }
        : {}),
      ...(strategy.kind === 'load-balance'
        ? { strategy: strategy.mode === 'consistent-hash' ? 'consistent-hashing' as const : 'round-robin' as const }
        : {}),
    }
    return { group, providerNames: resolved.providers, proxyNames: resolved.proxyNames }
  }

  const candidates = compileCandidates(strategy.candidates, strategy.id, context)
  if (!candidates) return undefined
  const group: MihomoProxyGroup = {
    name,
    type: strategy.kind === 'select' ? 'select' : 'fallback',
    ...(candidates.proxyNames.length > 0 ? { proxies: candidates.proxyNames } : {}),
    ...(candidates.providerNames.length > 0 ? { use: candidates.providerNames } : {}),
    ...candidates.filters,
    ...(strategy.kind === 'fallback' ? healthFields(strategy.healthCheck) : {}),
  }
  return { group, providerNames: candidates.providerNames, proxyNames: candidates.proxyNames }
}

function compileCandidates(candidates: StrategyCandidateRef[], ownerId: string, context: MihomoCompileContext) {
  const proxyNames: string[] = []
  const resolvedSets: ResolvedProxySet[] = []
  for (const candidate of candidates) {
    if (candidate.kind === 'strategy') {
      const name = context.strategyNames.get(candidate.id)
      if (name) proxyNames.push(name)
    } else resolvedSets.push(resolveProxySet(candidate, context))
  }
  const signatures = new Set(resolvedSets.map((set) => JSON.stringify([set.include, set.exclude])))
  if (signatures.size > 1 && resolvedSets.some((set) => set.include.length > 0 || set.exclude.length > 0)) {
    context.issues.push(mihomoIssue(
      'MIHOMO_FILTER_SCOPE_UNSUPPORTED', 'error', 'transform',
      '一个策略中的多个 Provider 使用了不同 Filter，Mihomo group filter 无法保持各自作用域。', ownerId,
    ))
    return undefined
  }
  const combined = resolvedSets.reduce<ResolvedProxySet>((result, item) => ({
    providers: [...new Set([...result.providers, ...item.providers])],
    proxyNames: [...new Set([...result.proxyNames, ...item.proxyNames])],
    include: [...new Set([...result.include, ...item.include])],
    exclude: [...new Set([...result.exclude, ...item.exclude])],
  }), { providers: [], proxyNames: [], include: [], exclude: [] })
  proxyNames.push(...combined.proxyNames)
  if (combined.providers.length === 0 && proxyNames.length === 0) {
    context.issues.push(mihomoIssue('MIHOMO_STRATEGY_EMPTY', 'error', 'strategy', '策略没有可生成的 Provider 或 Proxy Group reference。', ownerId))
    return undefined
  }
  return {
    providerNames: combined.providers,
    proxyNames: [...new Set(proxyNames)],
    filters: filtersForProxySet(combined),
  }
}

function ensureMembers(resolved: ResolvedProxySet, strategy: StrategyIR, context: MihomoCompileContext) {
  if (resolved.providers.length > 0 || resolved.proxyNames.length > 0) return true
  context.issues.push(mihomoIssue(
    'MIHOMO_STRATEGY_EMPTY', 'error', 'strategy', `Strategy “${strategy.name}” 没有可生成的 Provider 或 Proxy。`, strategy.id,
  ))
  return false
}

function healthFields(healthCheck?: HealthCheckIR) {
  return {
    url: healthCheck?.url ?? MIHOMO_DEFAULTS.healthCheckUrl,
    interval: healthCheck?.intervalSeconds ?? MIHOMO_DEFAULTS.healthCheckIntervalSeconds,
  }
}

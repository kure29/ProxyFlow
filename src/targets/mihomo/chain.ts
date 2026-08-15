import type { ChainStrategyIR } from '../../core/ir'
import type { MihomoCompileContext } from './context'
import { mihomoIssue } from './errors'
import { safePathSegment } from './naming'

export function compileMihomoChains(context: MihomoCompileContext) {
  for (const chain of context.ir.strategies.filter((strategy): strategy is ChainStrategyIR => strategy.kind === 'chain')) {
    lowerChainStrategy(chain, context)
  }
}

export function lowerChainStrategy(chain: ChainStrategyIR, context: MihomoCompileContext) {
  if (chain.hops.length < 2) return
  const templates = chain.hops.map((hop) => context.groupTemplates.get(hop.id))
  if (templates.some((template) => !template || template.providerNames.length === 0 || template.proxyNames.length > 0)) {
    context.issues.push(mihomoIssue(
      'MIHOMO_CHAIN_UNSUPPORTED_HOP', 'error', 'chain',
      `Chain “${chain.name}” 的每一跳必须是仅由 Provider 驱动的 Select/Auto/Fallback/Load Balance strategy。`, chain.id,
    ))
    return
  }

  const chainName = context.strategyNames.get(chain.id)!
  let dialerName = templates[0]!.group.name

  for (let index = 1; index < templates.length; index += 1) {
    const template = templates[index]!
    const isLast = index === templates.length - 1
    const groupName = isLast
      ? chainName
      : context.outboundNames.allocate(`${chainName} · Hop ${index + 1}`, `${chain.id}-hop-${index + 1}`)
    const derivedProviders: string[] = []

    for (const providerName of template.providerNames) {
      const provider = context.providers.get(providerName)
      if (!provider) continue
      const derivedName = context.outboundNames.allocate(
        `${providerName} via ${dialerName}`,
        `${chain.id}-${index}-${providerName}`,
      )
      context.providers.set(derivedName, {
        ...provider,
        path: `./providers/${safePathSegment(derivedName)}.yaml`,
        override: { ...provider.override, 'dialer-proxy': dialerName },
      })
      derivedProviders.push(derivedName)
    }

    context.groups.push({
      ...template.group,
      name: groupName,
      use: derivedProviders,
      proxies: undefined,
    })
    dialerName = groupName
  }

  const compiled = context.groups.find((group) => group.name === chainName)
  if (compiled) context.groupTemplates.set(chain.id, { group: compiled, providerNames: compiled.use ?? [], proxyNames: [] })
  context.issues.push(mihomoIssue(
    'MIHOMO_CHAIN_PROTOCOL_LIMITATION', 'warning', 'chain',
    `Chain “${chain.name}” 使用 Provider override.dialer-proxy lowering；UDP 与部分协议的可用性取决于实际订阅节点。`, chain.id,
  ))
}

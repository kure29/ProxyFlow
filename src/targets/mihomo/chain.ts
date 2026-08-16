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
  if (templates.some((template) => !template
    || (template.providerNames.length === 0 && template.proxyNames.length === 0)
    || template.proxyNames.some((name) => !context.proxies.has(name)))) {
    context.issues.push(mihomoIssue(
      'MIHOMO_CHAIN_UNSUPPORTED_HOP', 'error', 'chain',
      `Chain “${chain.name}” 的每一跳必须由 Provider 或已解析 proxy 直接驱动。`, chain.id,
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
    const derivedProxies: string[] = []

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

    for (const proxyName of template.proxyNames) {
      const proxy = context.proxies.get(proxyName)
      if (!proxy) continue
      const derivedName = context.outboundNames.allocate(
        `${proxyName} via ${dialerName}`,
        `${chain.id}-${index}-${proxyName}`,
      )
      context.proxies.set(derivedName, { ...proxy, name: derivedName, 'dialer-proxy': dialerName })
      derivedProxies.push(derivedName)
    }

    context.groups.push({
      ...template.group,
      name: groupName,
      use: derivedProviders.length > 0 ? derivedProviders : undefined,
      proxies: derivedProxies.length > 0 ? derivedProxies : undefined,
    })
    dialerName = groupName
  }

  const compiled = context.groups.find((group) => group.name === chainName)
  if (compiled) context.groupTemplates.set(chain.id, {
    group: compiled,
    providerNames: compiled.use ?? [],
    proxyNames: compiled.proxies ?? [],
  })
  context.issues.push(mihomoIssue(
    'MIHOMO_CHAIN_PROTOCOL_LIMITATION', 'warning', 'chain',
    `Chain “${chain.name}” 使用 target-specific dialer-proxy lowering；UDP 与部分协议的可用性取决于实际节点。`, chain.id,
  ))
}

import { isUnmodeledProxy, type ProxySetRef } from '../../core/ir'
import type { MihomoCompileContext, ResolvedProxySet } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'
import { safePathSegment } from './naming'

export function compileMihomoProviders(context: MihomoCompileContext) {
  for (const source of context.ir.sources) {
    if (source.kind === 'manual-proxy') {
      for (const proxy of source.proxies) {
        if (isUnmodeledProxy(proxy)) continue
        const name = context.proxyNamesById.get(proxy.id)!
        context.proxies.set(name, {
          name,
          type: proxy.kind === 'socks' ? 'socks5' : 'http',
          server: proxy.server,
          port: proxy.port,
          ...(proxy.username ? { username: proxy.username } : {}),
          ...(proxy.password ? { password: proxy.password } : {}),
          ...(proxy.kind === 'socks' ? { udp: true } : {}),
        })
      }
      continue
    }
    if (source.kind !== 'subscription' && source.kind !== 'provider') continue
    const url = source.kind === 'subscription' ? source.url : source.reference
    if (!url) continue
    const name = context.sourceNames.get(source.id)!
    context.providers.set(name, {
      type: 'http',
      url,
      path: `./providers/${safePathSegment(name)}.yaml`,
      interval: MIHOMO_DEFAULTS.providerIntervalSeconds,
      'health-check': {
        enable: true,
        url: MIHOMO_DEFAULTS.healthCheckUrl,
        interval: MIHOMO_DEFAULTS.healthCheckIntervalSeconds,
        lazy: true,
      },
    })
  }
}

export function resolveProxySet(
  ref: ProxySetRef,
  context: MihomoCompileContext,
  stack: string[] = [],
): ResolvedProxySet {
  if (ref.kind === 'source') {
    const name = context.sourceNames.get(ref.id)
    const source = context.ir.sources.find((item) => item.id === ref.id)
    const proxyNames = source?.kind === 'manual-proxy'
      ? source.proxies.flatMap((proxy) => {
        const proxyName = context.proxyNamesById.get(proxy.id)
        return proxyName && context.proxies.has(proxyName) ? [proxyName] : []
      })
      : []
    return { providers: name && context.providers.has(name) ? [name] : [], proxyNames, include: [], exclude: [] }
  }

  if (stack.includes(ref.id)) {
    context.issues.push(mihomoIssue(
      'MIHOMO_TRANSFORM_CYCLE', 'error', 'transform', `Transform cycle detected: ${[...stack, ref.id].join(' → ')}.`, ref.id,
    ))
    return { providers: [], proxyNames: [], include: [], exclude: [] }
  }
  const transform = context.ir.transforms.find((item) => item.id === ref.id)
  if (!transform) return { providers: [], proxyNames: [], include: [], exclude: [] }
  const nextStack = [...stack, ref.id]

  if (transform.kind === 'merge') return transform.inputs.reduce<ResolvedProxySet>((result, input) => {
    const resolved = resolveProxySet(input, context, nextStack)
    return {
      providers: unique([...result.providers, ...resolved.providers]),
      proxyNames: unique([...result.proxyNames, ...resolved.proxyNames]),
      include: unique([...result.include, ...resolved.include]),
      exclude: unique([...result.exclude, ...resolved.exclude]),
    }
  }, { providers: [], proxyNames: [], include: [], exclude: [] })

  const resolved = resolveProxySet(transform.input, context, nextStack)
  if (transform.kind === 'filter') return {
    ...resolved,
    proxyNames: resolved.proxyNames.filter((name) => matchesFilter(name, transform.include, transform.exclude)),
    include: unique([...resolved.include, ...transform.include]),
    exclude: unique([...resolved.exclude, ...transform.exclude]),
  }
  if (transform.kind === 'rename' && transform.pattern && transform.replacement !== undefined) return {
    ...resolved,
    providers: resolved.providers.flatMap((providerName) => {
      const provider = context.providers.get(providerName)
      if (!provider) return []
      const cacheKey = `${transform.id}:${providerName}`
      const cached = context.derivedProviderNames.get(cacheKey)
      if (cached) return [cached]
      const derivedName = context.outboundNames.allocate(`${providerName} · ${transform.name}`, `${providerName}-${transform.id}`)
      context.providers.set(derivedName, {
        ...provider,
        path: `./providers/${safePathSegment(derivedName)}.yaml`,
        override: {
          ...provider.override,
          'proxy-name': [...(provider.override?.['proxy-name'] ?? []), { pattern: transform.pattern!, target: transform.replacement! }],
        },
      })
      context.derivedProviderNames.set(cacheKey, derivedName)
      return [derivedName]
    }),
  }
  return resolved
}

export function filtersForProxySet(resolved: ResolvedProxySet) {
  return {
    ...(resolved.include.length > 0 ? { filter: keywordPattern(resolved.include) } : {}),
    ...(resolved.exclude.length > 0 ? { 'exclude-filter': keywordPattern(resolved.exclude) } : {}),
  }
}

function keywordPattern(values: string[]) {
  return `(?i)${values.map((value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`
}

function matchesFilter(name: string, include: string[], exclude: string[]) {
  const normalized = name.toLocaleLowerCase()
  return (include.length === 0 || include.some((item) => normalized.includes(item.toLocaleLowerCase())))
    && !exclude.some((item) => normalized.includes(item.toLocaleLowerCase()))
}

const unique = (values: string[]) => [...new Set(values)]

import type { ProxySetRef } from '../../core/ir'
import type { MihomoCompileContext, ResolvedProxySet } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'
import { safePathSegment } from './naming'

export function compileMihomoProviders(context: MihomoCompileContext) {
  for (const source of context.ir.sources) {
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
    return { providers: name && context.providers.has(name) ? [name] : [], include: [], exclude: [] }
  }

  if (stack.includes(ref.id)) {
    context.issues.push(mihomoIssue(
      'MIHOMO_TRANSFORM_CYCLE', 'error', 'transform', `Transform cycle detected: ${[...stack, ref.id].join(' → ')}.`, ref.id,
    ))
    return { providers: [], include: [], exclude: [] }
  }
  const transform = context.ir.transforms.find((item) => item.id === ref.id)
  if (!transform) return { providers: [], include: [], exclude: [] }
  const nextStack = [...stack, ref.id]

  if (transform.kind === 'merge') return transform.inputs.reduce<ResolvedProxySet>((result, input) => {
    const resolved = resolveProxySet(input, context, nextStack)
    return {
      providers: unique([...result.providers, ...resolved.providers]),
      include: unique([...result.include, ...resolved.include]),
      exclude: unique([...result.exclude, ...resolved.exclude]),
    }
  }, { providers: [], include: [], exclude: [] })

  const resolved = resolveProxySet(transform.input, context, nextStack)
  if (transform.kind === 'filter') return {
    ...resolved,
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

const unique = (values: string[]) => [...new Set(values)]

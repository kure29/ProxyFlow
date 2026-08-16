import { isUnmodeledProxy, type HttpProxyIR, type ProxySetRef, type SocksProxyIR } from '../../core/ir'
import type { ResolvedProxyItem, SingBoxCompileContext } from './context'
import { singBoxIssue } from './errors'
import type { SingBoxOutbound } from './model'

export function compileSingBoxProxyOutbounds(context: SingBoxCompileContext) {
  for (const source of context.ir.sources) {
    if (source.kind !== 'manual-proxy') continue
    for (const endpoint of source.proxies) {
      if (isUnmodeledProxy(endpoint)) continue
      const tag = context.endpointTags.get(endpoint.id)!
      context.outbounds.set(tag, endpointOutbound(endpoint, tag, context.dnsTag))
    }
  }
}

export function resolveSingBoxProxySet(
  ref: ProxySetRef,
  context: SingBoxCompileContext,
  stack: string[] = [],
): ResolvedProxyItem[] {
  const cacheKey = `${ref.kind}:${ref.id}`
  const cached = context.proxySetCache.get(cacheKey)
  if (cached) return cached

  if (ref.kind === 'source') {
    const source = context.ir.sources.find((item) => item.id === ref.id)
    const resolved = source?.kind === 'manual-proxy' ? source.proxies.flatMap((endpoint): ResolvedProxyItem[] => {
      if (isUnmodeledProxy(endpoint)) return []
      return [{ key: endpoint.id, endpoint, tag: context.endpointTags.get(endpoint.id)! }]
    }) : []
    context.proxySetCache.set(cacheKey, resolved)
    return resolved
  }

  if (stack.includes(ref.id)) {
    context.issues.push(singBoxIssue(
      'SINGBOX_TRANSFORM_CYCLE', 'error', 'transform', `Transform cycle detected: ${[...stack, ref.id].join(' → ')}.`, ref.id,
    ))
    return []
  }
  const transform = context.ir.transforms.find((item) => item.id === ref.id)
  if (!transform) return []
  const nextStack = [...stack, ref.id]
  let resolved: ResolvedProxyItem[]

  if (transform.kind === 'merge') {
    resolved = uniqueItems(transform.inputs.flatMap((input) => resolveSingBoxProxySet(input, context, nextStack)))
  } else {
    const input = resolveSingBoxProxySet(transform.input, context, nextStack)
    switch (transform.kind) {
      case 'filter':
        resolved = input.filter((item) => matchesFilter(item.endpoint.name, transform.include, transform.exclude))
        break
      case 'rename':
        resolved = renameItems(input, transform.id, transform.pattern, transform.replacement, context)
        break
      case 'sort':
        resolved = [...input].sort((left, right) => left.endpoint.name.localeCompare(right.endpoint.name))
        if (transform.direction === 'descending') resolved.reverse()
        break
      case 'deduplicate': {
        const seen = new Set<string>()
        resolved = input.filter((item) => {
          const value = transform.by === 'server' ? `${item.endpoint.server}:${item.endpoint.port}` : item.endpoint.name.toLocaleLowerCase()
          if (seen.has(value)) return false
          seen.add(value)
          return true
        })
        break
      }
      case 'limit':
        resolved = input.slice(0, transform.max)
        break
    }
  }

  context.proxySetCache.set(cacheKey, resolved)
  return resolved
}

function endpointOutbound(
  endpoint: HttpProxyIR | SocksProxyIR,
  tag: string,
  dnsTag?: string,
): SingBoxOutbound {
  const common = {
    tag,
    server: endpoint.server,
    server_port: endpoint.port,
    ...(endpoint.username ? { username: endpoint.username } : {}),
    ...(endpoint.password ? { password: endpoint.password } : {}),
    ...(dnsTag && !isIpAddress(endpoint.server) ? { domain_resolver: dnsTag } : {}),
  }
  return endpoint.kind === 'socks'
    ? { type: 'socks', version: '5', ...common }
    : { type: 'http', ...common }
}

function renameItems(
  items: ResolvedProxyItem[],
  transformId: string,
  pattern: string | undefined,
  replacement: string | undefined,
  context: SingBoxCompileContext,
) {
  if (!pattern || replacement === undefined) return items
  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'g')
  } catch {
    context.issues.push(singBoxIssue(
      'SINGBOX_TRANSFORM_RENAME_INVALID', 'error', 'transform', `Rename pattern “${pattern}” 不是有效正则表达式。`, transformId,
    ))
    return []
  }
  return items.map((item) => {
    const name = item.endpoint.name.replace(regex, replacement)
    const tag = context.names.allocate(name, `${transformId}-${item.endpoint.id}`)
    const endpoint = { ...item.endpoint, name }
    context.outbounds.set(tag, endpointOutbound(endpoint, tag, context.dnsTag))
    return { key: `${item.key}@${transformId}`, endpoint, tag }
  })
}

function matchesFilter(name: string, include: string[], exclude: string[]) {
  const normalized = name.toLocaleLowerCase()
  return (include.length === 0 || include.some((item) => normalized.includes(item.toLocaleLowerCase())))
    && !exclude.some((item) => normalized.includes(item.toLocaleLowerCase()))
}

function uniqueItems(items: ResolvedProxyItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

function isIpAddress(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':')
}

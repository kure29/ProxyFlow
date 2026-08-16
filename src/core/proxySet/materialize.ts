import type { ProxyFlowIR, ProxySetRef, ResolvedProxyEndpointIR, TransformIR } from '../ir'
import { isUnmodeledProxy } from '../ir'
import { proxyFingerprint, stableOpaqueHash } from '../proxy'

export interface MaterializationIssue {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  entityId?: string
}

export interface MaterializationResult {
  status: 'ready' | 'error'
  proxies: ResolvedProxyEndpointIR[]
  issues: MaterializationIssue[]
  inputCount: number
  outputCount: number
  removedCount: number
}

export interface MaterializationContext {
  cache: Map<string, MaterializationResult>
  evaluations: Map<string, number>
}

export function createMaterializationContext(): MaterializationContext {
  return { cache: new Map(), evaluations: new Map() }
}

export function materializeProxySet(
  ir: ProxyFlowIR,
  ref: ProxySetRef,
  context = createMaterializationContext(),
  stack: string[] = [],
): MaterializationResult {
  const key = `${ref.kind}:${ref.id}`
  const cached = context.cache.get(key)
  if (cached) return cached
  context.evaluations.set(key, (context.evaluations.get(key) ?? 0) + 1)
  if (stack.includes(key)) return cache(context, key, failed('PROXY_SET_CYCLE', `ProxySet cycle detected: ${[...stack, key].join(' → ')}.`, ref.id))

  if (ref.kind === 'source') {
    const source = ir.sources.find((item) => item.id === ref.id)
    if (!source) return cache(context, key, failed('SOURCE_UNAVAILABLE', '节点来源不存在。', ref.id))
    if (source.kind === 'manual-proxy') {
      const resolved = source.proxies.filter((proxy): proxy is ResolvedProxyEndpointIR => !isUnmodeledProxy(proxy))
      return cache(context, key, readyProxySource(resolved))
    }
    if (source.kind === 'subscription' && source.proxies) {
      return cache(context, key, readyProxySource(source.proxies, source.id))
    }
    if (source.kind === 'subscription' && source.materialization?.status === 'error') return cache(context, key, failed(
      source.materialization.issueCode ?? 'SOURCE_UNAVAILABLE', '订阅源解析失败；下游处理已被阻止。', source.id,
    ))
    return cache(context, key, failed('SOURCE_UNAVAILABLE', `Source “${source.name}” 尚未解析为可处理节点。`, source.id))
  }

  const transform = ir.transforms.find((item) => item.id === ref.id)
  if (!transform) return cache(context, key, failed('TRANSFORM_UNAVAILABLE', '处理节点不存在。', ref.id))
  const nextStack = [...stack, key]
  const result = transform.kind === 'merge'
    ? materializeMerge(ir, transform, context, nextStack)
    : materializeSingle(ir, transform, context, nextStack)
  return cache(context, key, result)
}

function readyProxySource(resolved: ResolvedProxyEndpointIR[], entityId?: string) {
  const proxies = resolved.filter((proxy) => proxy.metadata?.compatibility?.status !== 'partial')
  const result = ready(proxies, resolved.length)
  const excluded = resolved.length - proxies.length
  if (excluded > 0) result.issues.push({
    code: 'PROXY_VARIANT_EXCLUDED', severity: 'warning', ...(entityId ? { entityId } : {}),
    message: `${excluded} 个包含未可靠支持特性的节点已从处理结果中排除；它们仍保留在 Import Summary 与节点预览中。`,
  })
  return result
}

function materializeMerge(ir: ProxyFlowIR, transform: Extract<TransformIR, { kind: 'merge' }>, context: MaterializationContext, stack: string[]) {
  const inputs = transform.inputs.map((input) => materializeProxySet(ir, input, context, stack))
  const upstreamIssues = inputs.flatMap((input) => input.issues)
  if (inputs.some((input) => input.status === 'error')) return failedWithIssues('SOURCE_UNAVAILABLE', 'Merge 被上游错误阻止。', transform.id, upstreamIssues)
  const proxies = inputs.flatMap((input) => input.proxies)
  return withIssues(withEmptyWarning(ready(proxies, proxies.length), transform), upstreamIssues)
}

function materializeSingle(ir: ProxyFlowIR, transform: Exclude<TransformIR, { kind: 'merge' }>, context: MaterializationContext, stack: string[]): MaterializationResult {
  const input = materializeProxySet(ir, transform.input, context, stack)
  if (input.status === 'error') return failedWithIssues('SOURCE_UNAVAILABLE', `${transform.name} 被上游错误阻止。`, transform.id, input.issues)
  const before = input.proxies
  if (transform.kind === 'filter') {
    const regexes = compileFilterRegexes(transform)
    if ('error' in regexes) return failedWithIssues('INVALID_FILTER_REGEX', regexes.error, transform.id, input.issues)
    const proxies = before.filter((proxy) => matchesFilter(proxy, transform, regexes))
    return withIssues(withEmptyWarning(ready(proxies, before.length), transform), input.issues)
  }
  if (transform.kind === 'rename') {
    if (!transform.pattern || transform.replacement === undefined) return withIssues(ready(before, before.length), input.issues)
    let regex: RegExp
    try { regex = new RegExp(transform.pattern, 'g') } catch { return failedWithIssues('INVALID_RENAME_REGEX', 'Rename 正则表达式无效。', transform.id, input.issues) }
    const proxies = before.map((proxy) => {
      const name = proxy.name.replace(regex, transform.replacement!)
      return name === proxy.name ? proxy : { ...proxy, id: `proxy-${stableOpaqueHash(`${proxy.id}\u0000${transform.id}\u0000${name}`)}`, name }
    })
    return withIssues(ready(proxies, before.length), input.issues)
  }
  if (transform.kind === 'sort') {
    if (transform.by === 'latency') return failedWithIssues('SPEED_TEST_REQUIRED', '延迟排序需要真实测速；V0.6 不生成假延迟。', transform.id, input.issues)
    const by = transform.by ?? 'name'
    const proxies = [...before].sort((left, right) => sortValue(left, by).localeCompare(sortValue(right, by), undefined, { numeric: true, sensitivity: 'base' }))
    if (transform.direction === 'descending') proxies.reverse()
    return withIssues(ready(proxies, before.length), input.issues)
  }
  if (transform.kind === 'deduplicate') {
    const seen = new Set<string>()
    const proxies = before.filter((proxy) => {
      const fingerprint = proxyFingerprint(proxy)
      if (seen.has(fingerprint)) return false
      seen.add(fingerprint)
      return true
    })
    return withIssues(withEmptyWarning(ready(proxies, before.length), transform), input.issues)
  }
  if (!Number.isInteger(transform.max) || transform.max! < 1) return failedWithIssues('LIMIT_INVALID', 'Limit 必须是大于 0 的整数。', transform.id, input.issues)
  return withIssues(withEmptyWarning(ready(before.slice(0, transform.max), before.length), transform), input.issues)
}

function compileFilterRegexes(transform: Extract<TransformIR, { kind: 'filter' }>): { include?: RegExp; exclude?: RegExp } | { error: string } {
  try {
    return {
      ...(transform.includeRegex ? { include: new RegExp(transform.includeRegex, 'i') } : {}),
      ...(transform.excludeRegex ? { exclude: new RegExp(transform.excludeRegex, 'i') } : {}),
    }
  } catch { return { error: 'Filter 正则表达式无效。' } }
}

function matchesFilter(proxy: ResolvedProxyEndpointIR, transform: Extract<TransformIR, { kind: 'filter' }>, regexes: { include?: RegExp; exclude?: RegExp }) {
  const name = proxy.name.toLocaleLowerCase()
  const region = proxy.metadata?.region?.code ?? 'UNKNOWN'
  const includedByName = transform.include.length === 0 || transform.include.some((value) => name.includes(value.toLocaleLowerCase()))
  const excludedByName = transform.exclude.some((value) => name.includes(value.toLocaleLowerCase()))
  const includedByRegex = !regexes.include || regexes.include.test(proxy.name)
  const excludedByRegex = Boolean(regexes.exclude?.test(proxy.name))
  const includedByRegion = !transform.includeRegions?.length || transform.includeRegions.includes(region)
  const excludedByRegion = Boolean(transform.excludeRegions?.includes(region))
  const includedByProtocol = !transform.includeProtocols?.length || transform.includeProtocols.includes(proxy.protocol)
  const excludedByProtocol = Boolean(transform.excludeProtocols?.includes(proxy.protocol))
  return includedByName && !excludedByName && includedByRegex && !excludedByRegex
    && includedByRegion && !excludedByRegion && includedByProtocol && !excludedByProtocol
}

function sortValue(proxy: ResolvedProxyEndpointIR, by: 'name' | 'region' | 'protocol') {
  if (by === 'region') return `${proxy.metadata?.region?.code ?? 'UNKNOWN'}\u0000${proxy.name}`
  if (by === 'protocol') return `${proxy.protocol}\u0000${proxy.name}`
  return proxy.name
}

function ready(proxies: ResolvedProxyEndpointIR[], inputCount: number): MaterializationResult {
  return { status: 'ready', proxies, issues: [], inputCount, outputCount: proxies.length, removedCount: inputCount - proxies.length }
}

function failed(code: string, message: string, entityId?: string): MaterializationResult {
  return { status: 'error', proxies: [], issues: [{ code, severity: 'error', message, entityId }], inputCount: 0, outputCount: 0, removedCount: 0 }
}

function failedWithIssues(code: string, message: string, entityId: string, issues: MaterializationIssue[]): MaterializationResult {
  const result = failed(code, message, entityId)
  result.issues.unshift(...issues)
  return result
}

function withEmptyWarning(result: MaterializationResult, transform: TransformIR): MaterializationResult {
  if (result.status === 'ready' && result.outputCount === 0) result.issues.push({ code: 'EMPTY_RESULT', severity: 'warning', message: `${transform.name} 正常执行，但结果为空。`, entityId: transform.id })
  return result
}

function withIssues(result: MaterializationResult, issues: MaterializationIssue[]) {
  if (issues.length > 0) result.issues.unshift(...issues)
  return result
}

function cache(context: MaterializationContext, key: string, result: MaterializationResult) {
  context.cache.set(key, result)
  return result
}

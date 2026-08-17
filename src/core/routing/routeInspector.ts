import type { ProxyFlowIR, RouteTargetIR, StrategyCandidateRef, StrategyIR, TrafficMatcherIR } from '../ir'

export interface RouteQuery {
  hostname?: string
  ip?: string
  port?: number
  serviceId?: string
}

export type RouteInspectionStatus = 'matched' | 'default' | 'unresolved'
export type RouteInspectionTargetSupport = 'supported' | 'unsupported' | 'unknown'

export type RouteMatchReasonCode =
  | 'domain-exact-match'
  | 'domain-suffix-match'
  | 'domain-keyword-match'
  | 'cidr-match'
  | 'port-match'
  | 'service-match'
  | 'value-mismatch'
  | 'input-missing'
  | 'unsupported-matcher'

export interface RouteMatchReason {
  code: RouteMatchReasonCode
  detail?: string
}

export interface RouteRuleEvaluation {
  routeId: string
  name: string
  priority: number
  matcher: TrafficMatcherIR
  matched: boolean
  reason: RouteMatchReason
}

export interface StrategyInspection {
  id: string
  name: string
  kind: StrategyIR['kind'] | 'missing'
  candidatePath: string[]
  candidateCount: number
  healthCheckUrl?: string
  targetSupport: {
    mihomo: RouteInspectionTargetSupport
    'sing-box': RouteInspectionTargetSupport
  }
}

export interface RouteInspectionTarget {
  kind: RouteTargetIR['kind']
  label: string
  strategy?: StrategyInspection
}

export interface RouteInspectionResult {
  status: RouteInspectionStatus
  query: RouteQuery
  evaluations: RouteRuleEvaluation[]
  matchedRule?: RouteRuleEvaluation
  target?: RouteInspectionTarget
  defaultRoute?: RouteInspectionTarget
}

export function inspectRoute(ir: ProxyFlowIR, query: RouteQuery): RouteInspectionResult {
  const normalizedQuery = normalizeQuery(query)
  const evaluations = [...ir.routes]
    .sort((left, right) => left.priority - right.priority)
    .map((route) => evaluateRoute(route, normalizedQuery))
  const matchedRule = evaluations.find((evaluation) => evaluation.matched)

  if (!hasQuerySignal(normalizedQuery)) return { status: 'unresolved', query: normalizedQuery, evaluations }
  if (matchedRule) {
    return {
      status: 'matched',
      query: normalizedQuery,
      evaluations,
      matchedRule,
      target: explainTarget(ir, matchedRule.matcher, matchedRule.routeId, matchedRule.name),
    }
  }

  const defaultRoute = ir.finalRoute ? explainTarget(ir, undefined, 'final', 'Default Route', ir.finalRoute.target) : undefined
  return { status: 'default', query: normalizedQuery, evaluations, defaultRoute, target: defaultRoute }
}

function explainTarget(
  ir: ProxyFlowIR,
  _matcher: TrafficMatcherIR | undefined,
  _routeId: string,
  _routeName: string,
  explicitTarget?: RouteTargetIR,
): RouteInspectionTarget {
  const target = explicitTarget ?? ir.routes.find((route) => route.id === _routeId)?.target
  if (!target) return { kind: 'reject', label: 'Unavailable' }
  if (target.kind !== 'strategy') return { kind: target.kind, label: target.kind === 'direct' ? 'DIRECT' : 'REJECT' }
  const strategy = inspectStrategy(ir, target.id)
  return { kind: 'strategy', label: strategy.name, strategy }
}

function inspectStrategy(ir: ProxyFlowIR, strategyId: string, stack: string[] = []): StrategyInspection {
  const strategy = ir.strategies.find((item) => item.id === strategyId)
  if (!strategy) return {
    id: strategyId,
    name: strategyId,
    kind: 'missing',
    candidatePath: [],
    candidateCount: 0,
    targetSupport: { mihomo: 'unknown', 'sing-box': 'unknown' },
  }
  if (stack.includes(strategy.id)) return {
    id: strategy.id,
    name: strategy.name,
    kind: strategy.kind,
    candidatePath: [...stack, strategy.id],
    candidateCount: 0,
    targetSupport: { mihomo: 'unsupported', 'sing-box': 'unsupported' },
  }

  const nextStack = [...stack, strategy.id]
  const candidateRefs = strategy.kind === 'select' || strategy.kind === 'fallback' ? strategy.candidates : undefined
  const candidatePath = candidateRefs
    ? candidateRefs.flatMap((candidate) => describeCandidate(ir, candidate, nextStack))
    : strategy.kind === 'auto-select' || strategy.kind === 'load-balance'
      ? [describeProxySet(ir, strategy.source.kind, strategy.source.id)]
      : strategy.kind === 'fixed'
        ? strategy.proxyId ? [describeProxySet(ir, 'source', strategy.proxyId)] : []
        : strategy.kind === 'chain'
          ? strategy.hops.flatMap((hop) => inspectStrategy(ir, hop.id, nextStack).candidatePath.length ? [inspectStrategy(ir, hop.id, nextStack).name] : [hop.id])
          : []
  const candidateCount = candidateRefs?.length
    ?? (strategy.kind === 'fixed' ? (strategy.proxyId ? 1 : 0) : candidatePath.length)
  const targetSupport = strategySupport(strategy, candidateCount)
  return {
    id: strategy.id,
    name: strategy.name,
    kind: strategy.kind,
    candidatePath,
    candidateCount,
    healthCheckUrl: 'healthCheck' in strategy ? strategy.healthCheck?.url : undefined,
    targetSupport,
  }
}

function describeCandidate(ir: ProxyFlowIR, candidate: StrategyCandidateRef, stack: string[]) {
  if (candidate.kind === 'strategy') {
    const nested = inspectStrategy(ir, candidate.id, stack)
    return [nested.name]
  }
  return [describeProxySet(ir, candidate.kind, candidate.id)]
}

function describeProxySet(ir: ProxyFlowIR, kind: 'source' | 'transform', id: string) {
  const collection = kind === 'source' ? ir.sources : ir.transforms
  return collection.find((item) => item.id === id)?.name ?? id
}

function strategySupport(strategy: StrategyIR, candidateCount: number) {
  if (candidateCount === 0) return { mihomo: 'unsupported' as const, 'sing-box': 'unsupported' as const }
  if (strategy.kind === 'fallback' || strategy.kind === 'load-balance') return { mihomo: 'supported' as const, 'sing-box': 'unsupported' as const }
  return { mihomo: 'supported' as const, 'sing-box': 'supported' as const }
}

function evaluateRoute(route: ProxyFlowIR['routes'][number], query: RouteQuery): RouteRuleEvaluation {
  const result = matchMatcher(route.matcher, query)
  return { routeId: route.id, name: route.name, priority: route.priority, matcher: route.matcher, ...result }
}

function matchMatcher(matcher: TrafficMatcherIR, query: RouteQuery): Pick<RouteRuleEvaluation, 'matched' | 'reason'> {
  if (matcher.kind === 'service') {
    if (!query.serviceId) return { matched: false, reason: { code: 'input-missing', detail: 'service' } }
    return matcher.serviceIds.includes(query.serviceId)
      ? { matched: true, reason: { code: 'service-match', detail: query.serviceId } }
      : { matched: false, reason: { code: 'value-mismatch', detail: 'service' } }
  }
  if (matcher.kind === 'domain' || matcher.kind === 'domain-suffix' || matcher.kind === 'domain-keyword') {
    if (!query.hostname) return { matched: false, reason: { code: 'input-missing', detail: 'hostname' } }
    const hostname = normalizeHostname(query.hostname)
    const value = normalizeHostname(matcher.value)
    const matched = matcher.kind === 'domain'
      ? hostname === value
      : matcher.kind === 'domain-suffix'
        ? hostname === value || hostname.endsWith(`.${value}`)
        : hostname.includes(value)
    return matched
      ? { matched: true, reason: { code: `${matcher.kind}-match` as RouteMatchReasonCode, detail: matcher.value } }
      : { matched: false, reason: { code: 'value-mismatch', detail: 'hostname' } }
  }
  if (matcher.kind === 'ip-cidr' || matcher.kind === 'ip-cidr6') {
    if (!query.ip) return { matched: false, reason: { code: 'input-missing', detail: 'ip' } }
    const matched = cidrContains(query.ip, matcher.value, matcher.kind === 'ip-cidr6')
    return matched
      ? { matched: true, reason: { code: 'cidr-match', detail: matcher.value } }
      : { matched: false, reason: { code: 'value-mismatch', detail: 'ip' } }
  }
  if (matcher.kind === 'port') {
    if (query.port === undefined) return { matched: false, reason: { code: 'input-missing', detail: 'port' } }
    return query.port === matcher.port
      ? { matched: true, reason: { code: 'port-match', detail: String(matcher.port) } }
      : { matched: false, reason: { code: 'value-mismatch', detail: 'port' } }
  }
  return { matched: false, reason: { code: 'unsupported-matcher', detail: matcher.kind } }
}

function normalizeQuery(query: RouteQuery): RouteQuery {
  return {
    hostname: query.hostname?.trim().toLowerCase().replace(/\.$/, '') || undefined,
    ip: query.ip?.trim() || undefined,
    port: query.port === undefined || query.port === 0 ? undefined : query.port,
    serviceId: query.serviceId?.trim() || undefined,
  }
}

function hasQuerySignal(query: RouteQuery) {
  return Boolean(query.hostname || query.ip || query.port !== undefined || query.serviceId)
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
}

function cidrContains(address: string, cidr: string, ipv6: boolean) {
  const [network, prefixText] = cidr.trim().split('/')
  const prefix = Number(prefixText)
  const bits = ipv6 ? 128 : 32
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return false
  const addressValue = parseIp(address, ipv6)
  const networkValue = parseIp(network, ipv6)
  if (addressValue === undefined || networkValue === undefined) return false
  const mask = prefix === 0 ? 0n : (((1n << BigInt(bits)) - 1n) << BigInt(bits - prefix))
  return (addressValue & mask) === (networkValue & mask)
}

function parseIp(value: string, ipv6: boolean) {
  if (ipv6) {
    const groups = expandIpv6(value)
    if (!groups) return undefined
    return groups.reduce((result, group) => (result << 16n) | BigInt(group), 0n)
  }
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined
  return parts.reduce((result, part) => (result << 8n) | BigInt(part), 0n)
}

function expandIpv6(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized.includes(':')) return undefined
  const halves = normalized.split('::')
  if (halves.length > 2) return undefined
  const parse = (part: string) => part ? part.split(':').map((group) => Number.parseInt(group, 16)).filter((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) : []
  const left = parse(halves[0])
  const right = parse(halves[1] ?? '')
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return undefined
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

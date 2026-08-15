import type { ProxyFlowIR, ProxySetRef, RouteTargetIR, SemanticIssue, StrategyCandidateRef } from '../ir'
import { semanticIssue } from '../ir'
import { detectChainCycles } from './detectChainCycles'

const knownTargets = new Set(['mihomo', 'sing-box', 'surge', 'loon', 'quantumult-x', 'shadowrocket', 'stash'])

export function validateIR(ir: ProxyFlowIR): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const sourceIds = new Set(ir.sources.map((source) => source.id))
  const transformIds = new Set(ir.transforms.map((transform) => transform.id))
  const strategyIds = new Set(ir.strategies.map((strategy) => strategy.id))
  const serviceIds = new Set(ir.services.map((service) => service.id))
  const add = (issue: SemanticIssue) => issues.push(issue)

  validateDuplicateIds(ir.sources, 'source', add)
  validateDuplicateIds(ir.transforms, 'transform', add)
  validateDuplicateIds(ir.strategies, 'strategy', add)
  validateDuplicateIds(ir.services, 'service', add)
  validateDuplicateIds(ir.routes, 'route', add)
  validateDuplicateIds(ir.outputs, 'output', add)

  for (const source of ir.sources) {
    if (!source.name.trim()) add(entityIssue('SOURCE_NAME_MISSING', 'error', 'Source name is required.', 'source', source.id))
    if (source.kind === 'subscription' && !source.url) add(entityIssue(
      'SUBSCRIPTION_URL_MISSING', 'warning', `Subscription "${source.name}" has no URL.`, 'source', source.id,
    ))
  }

  for (const transform of ir.transforms) {
    if (transform.kind === 'merge') {
      if (transform.inputs.length < 2) add(entityIssue(
        'MERGE_REQUIRES_MULTIPLE_INPUTS', 'error', `Merge "${transform.name}" requires at least two inputs.`, 'transform', transform.id,
      ))
      transform.inputs.forEach((ref) => validateProxySetRef(ref, sourceIds, transformIds, transform.id, add))
    } else {
      validateProxySetRef(transform.input, sourceIds, transformIds, transform.id, add)
      if (transform.kind === 'filter' && transform.include.length === 0 && transform.exclude.length === 0) add(entityIssue(
        'FILTER_EMPTY', 'info', `Filter "${transform.name}" has no include or exclude conditions.`, 'transform', transform.id,
      ))
      if (transform.kind === 'limit' && transform.max !== undefined && transform.max < 1) add(entityIssue(
        'LIMIT_INVALID', 'error', `Limit "${transform.name}" must be greater than zero.`, 'transform', transform.id,
      ))
    }
  }

  for (const strategy of ir.strategies) {
    switch (strategy.kind) {
      case 'fixed':
        if (!strategy.proxyId) add(entityIssue('FIXED_PROXY_MISSING', 'error', `Fixed strategy "${strategy.name}" has no proxy.`, 'strategy', strategy.id))
        break
      case 'select':
        if (strategy.candidates.length === 0) add(entityIssue('SELECT_CANDIDATES_EMPTY', 'error', `Select strategy "${strategy.name}" has no candidates.`, 'strategy', strategy.id))
        strategy.candidates.forEach((ref) => validateCandidateRef(ref, sourceIds, transformIds, strategyIds, strategy.id, add))
        break
      case 'auto-select':
        validateProxySetRef(strategy.source, sourceIds, transformIds, strategy.id, add)
        break
      case 'fallback':
        if (strategy.candidates.length === 0) add(entityIssue('FALLBACK_CANDIDATES_EMPTY', 'error', `Fallback strategy "${strategy.name}" has no candidates.`, 'strategy', strategy.id))
        strategy.candidates.forEach((ref) => validateCandidateRef(ref, sourceIds, transformIds, strategyIds, strategy.id, add))
        break
      case 'load-balance':
        validateProxySetRef(strategy.source, sourceIds, transformIds, strategy.id, add)
        break
      case 'chain':
        if (strategy.hops.length === 0) add(entityIssue('CHAIN_EMPTY', 'error', `Chain "${strategy.name}" has no hops.`, 'chain', strategy.id))
        if (strategy.hops.length === 1) add(entityIssue('CHAIN_SINGLE_HOP', 'warning', `Chain "${strategy.name}" has only one hop.`, 'chain', strategy.id))
        for (const hop of strategy.hops) {
          if (hop.id === strategy.id) add(entityIssue('CHAIN_SELF_REFERENCE', 'error', `Chain "${strategy.name}" references itself.`, 'chain', strategy.id))
          else if (!strategyIds.has(hop.id)) add(entityIssue('CHAIN_REFERENCE_NOT_FOUND', 'error', `Chain "${strategy.name}" references missing strategy "${hop.id}".`, 'chain', strategy.id))
        }
        break
    }
  }

  for (const cycle of detectChainCycles(ir.strategies)) add(entityIssue(
    'CHAIN_CYCLE', 'error', `Chain cycle detected: ${cycle.join(' → ')}.`, 'chain', cycle[0],
  ))

  for (const route of ir.routes) {
    if (route.matcher.kind === 'service' && route.matcher.serviceIds.length === 0) add(entityIssue(
      'ROUTE_MATCHER_MISSING', 'error', `Route "${route.name}" has no services.`, 'route', route.id,
    ))
    if (route.matcher.kind === 'service') for (const serviceId of route.matcher.serviceIds) {
      if (!serviceIds.has(serviceId)) add(entityIssue(
        'SERVICE_REFERENCE_NOT_FOUND', 'error', `Service reference “${serviceId}” does not exist.`, 'route', route.id,
      ))
    }
    validateRouteTarget(route.target, strategyIds, 'route', route.id, add)
  }

  if (!ir.finalRoute) add(semanticIssue('FINAL_MISSING', 'error', 'ir', 'Universal IR requires a Final route.'))
  else validateRouteTarget(ir.finalRoute.target, strategyIds, 'final', 'final', add)

  if (ir.outputs.length === 0) add(semanticIssue('OUTPUT_MISSING', 'error', 'ir', 'Universal IR requires at least one output.'))
  for (const output of ir.outputs) {
    if (!knownTargets.has(output.target)) add(entityIssue(
      'OUTPUT_TARGET_UNKNOWN', 'error', `Output "${output.name}" has unknown target "${String(output.target)}".`, 'output', output.id,
    ))
  }
  if (ir.dns?.mode === 'custom' && (ir.dns.resolvers?.length ?? 0) === 0) add(semanticIssue(
    'DNS_CUSTOM_RESOLVER_MISSING', 'warning', 'ir', 'Custom DNS mode has no resolvers.', { entity: { type: 'dns', id: 'dns' } },
  ))
  return issues
}

function validateProxySetRef(
  ref: ProxySetRef,
  sourceIds: Set<string>,
  transformIds: Set<string>,
  ownerId: string,
  add: (issue: SemanticIssue) => void,
) {
  const exists = ref.kind === 'source' ? sourceIds.has(ref.id) : transformIds.has(ref.id)
  if (!exists) add(entityIssue(
    'PROXY_SET_REFERENCE_NOT_FOUND', 'error', `Reference ${ref.kind}:"${ref.id}" does not exist.`, 'entity', ownerId,
  ))
}

function validateCandidateRef(
  ref: StrategyCandidateRef,
  sourceIds: Set<string>,
  transformIds: Set<string>,
  strategyIds: Set<string>,
  ownerId: string,
  add: (issue: SemanticIssue) => void,
) {
  if (ref.kind === 'strategy') {
    if (!strategyIds.has(ref.id)) add(entityIssue('STRATEGY_REFERENCE_NOT_FOUND', 'error', `Strategy reference "${ref.id}" does not exist.`, 'strategy', ownerId))
  } else validateProxySetRef(ref, sourceIds, transformIds, ownerId, add)
}

function validateRouteTarget(
  target: RouteTargetIR,
  strategyIds: Set<string>,
  entityType: string,
  entityId: string,
  add: (issue: SemanticIssue) => void,
) {
  if (target.kind === 'strategy' && !strategyIds.has(target.id)) add(entityIssue(
    'ROUTE_TARGET_NOT_FOUND', 'error', `Route target strategy "${target.id}" does not exist.`, entityType, entityId,
  ))
}

function validateDuplicateIds(
  entities: Array<{ id: string }>,
  type: string,
  add: (issue: SemanticIssue) => void,
) {
  const seen = new Set<string>()
  for (const entity of entities) {
    if (seen.has(entity.id)) add(entityIssue('IR_DUPLICATE_ID', 'error', `Duplicate ${type} id "${entity.id}".`, type, entity.id))
    seen.add(entity.id)
  }
}

function entityIssue(
  code: string,
  severity: SemanticIssue['severity'],
  message: string,
  type: string,
  id: string,
) {
  return semanticIssue(code, severity, 'ir', message, { entity: { type, id } })
}

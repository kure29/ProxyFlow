import type { ProxyFlowIR, ProxyEndpointIR } from '../../core/ir'
import {
  isPolicyReference, isTargetNativeStrategyConfig, subnetMatcherExpression,
  type PolicyReference, type TargetNativeStrategyIR,
} from '../../core/targetNative'
import type { CompatibilityIssue } from '../../types/project'
import type { SurgeSmartPolicyEntry, SurgeSubnetPolicyEntry } from './model'
import { isUnmodeledProxy } from '../../core/ir'
import type { SurgeCompileContext } from './context'
import { registerSurgeProxy } from './context'
import { surgeIssue } from './errors'
import { checkSurgeProxy } from './proxies'
import { isSafeSurgePolicyName } from './serializer'

export function validateSurgeNativeStrategies(
  ir: ProxyFlowIR,
  nativeStrategies: readonly TargetNativeStrategyIR[],
  issues: CompatibilityIssue[],
) {
  const endpointById = allEndpoints(ir)
  const strategyIds = new Set(ir.strategies.map((strategy) => strategy.id))
  const nativeIds = new Set(nativeStrategies.flatMap((strategy) => typeof strategy?.id === 'string' ? [strategy.id] : []))
  const names = new Map<string, string>()
  for (const strategy of nativeStrategies) {
    if (!strategy || typeof strategy.id !== 'string' || typeof strategy.name !== 'string' || !isTargetNativeStrategyConfig(strategy)) {
      issues.push(surgeIssue(
        'TARGET_NATIVE_STRATEGY_INVALID', 'error', 'strategy', 'A target-native strategy contains invalid typed configuration.', typeof strategy?.id === 'string' ? strategy.id : undefined,
      ))
      continue
    }
    if (!isSafeSurgePolicyName(strategy.name)) issues.push(surgeIssue(
      'SURGE_POLICY_NAME_UNSAFE', 'error', 'naming', `Policy name “${strategy.name}” cannot be preserved safely in the current Surge profile grammar.`, strategy.id,
    ))
    const normalized = strategy.name.toLowerCase()
    const owner = names.get(normalized)
    if (owner && owner !== strategy.id) issues.push(surgeIssue(
      'SURGE_POLICY_NAME_DUPLICATE', 'error', 'naming', `Policy name “${strategy.name}” is used by more than one target-native strategy.`, strategy.id,
    ))
    names.set(normalized, strategy.id)
    if (strategy.kind === 'smart') {
      if (strategy.members.length === 0) issues.push(surgeIssue(
        'SURGE_SMART_MEMBERS_EMPTY', 'error', 'strategy', `Smart strategy “${strategy.name}” must contain at least one proxy member.`, strategy.id,
      ))
      const memberIds = new Set<string>()
      for (const member of strategy.members) {
        if (!isPolicyReference(member) || member.kind !== 'proxy') {
          issues.push(surgeIssue(
            'SURGE_SMART_MEMBER_UNSUPPORTED', 'error', 'strategy', `Smart strategy “${strategy.name}” accepts proxy endpoints only; malformed or ${isPolicyReference(member) ? member.kind : 'unknown'} policies are not valid candidates.`, strategy.id,
          ))
          continue
        }
        if (memberIds.has(member.id)) issues.push(surgeIssue(
          'SURGE_SMART_MEMBER_DUPLICATE', 'error', 'strategy', `Smart strategy “${strategy.name}” contains duplicate proxy member “${member.id}”.`, strategy.id,
        ))
        memberIds.add(member.id)
        const endpoint = endpointById.get(member.id)
        if (!endpoint || isUnmodeledProxy(endpoint)) issues.push(surgeIssue(
          'SURGE_NATIVE_PROXY_REFERENCE_NOT_FOUND', 'error', 'strategy', `Smart strategy “${strategy.name}” references a missing or unmodeled proxy “${member.id}”.`, strategy.id,
        ))
        else issues.push(...checkSurgeProxy(endpoint, strategy.id))
      }
    } else {
      if (!isPolicyReference(strategy.defaultPolicy)) issues.push(surgeIssue(
        'SURGE_SUBNET_DEFAULT_REQUIRED', 'error', 'strategy', `Subnet strategy “${strategy.name}” requires an explicit default policy.`, strategy.id,
      ))
      else validatePolicyReference(strategy.defaultPolicy, strategy, endpointById, strategyIds, nativeIds, issues, 'default')
      const seenMatchers = new Set<string>()
      strategy.conditions.forEach((condition, index) => {
        if (!condition?.matcher || !isSurgeMatcher(condition.matcher)) {
          issues.push(surgeIssue(
            'SURGE_SUBNET_MATCHER_INVALID', 'error', 'strategy', `Subnet strategy “${strategy.name}” condition ${index + 1} has a missing or invalid matcher value.`, strategy.id,
          ))
          return
        }
        const expression = subnetMatcherExpression(condition.matcher)
        if (seenMatchers.has(expression)) issues.push(surgeIssue(
          'SURGE_SUBNET_MATCHER_DUPLICATE', 'warning', 'strategy', `Subnet strategy “${strategy.name}” repeats matcher “${expression}”; the first matching condition retains native precedence.`, strategy.id,
        ))
        seenMatchers.add(expression)
        if (!isPolicyReference(condition.policy)) {
          issues.push(surgeIssue(
            'SURGE_SUBNET_POLICY_INVALID', 'error', 'strategy', `Subnet strategy “${strategy.name}” condition ${index + 1} has no valid policy target.`, strategy.id,
          ))
          return
        }
        validatePolicyReference(condition.policy, strategy, endpointById, strategyIds, nativeIds, issues, `condition ${index + 1}`)
      })
    }
  }
  validateNativeStrategyCycles(nativeStrategies, issues)
}

function validateNativeStrategyCycles(
  nativeStrategies: readonly TargetNativeStrategyIR[],
  issues: CompatibilityIssue[],
) {
  const strategies = new Map(nativeStrategies.flatMap((strategy) => {
    if (!strategy || typeof strategy.id !== 'string' || !isTargetNativeStrategyConfig(strategy)) return []
    return [[strategy.id, strategy] as const]
  }))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const reported = new Set<string>()

  const visit = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const start = path.indexOf(id)
      const cycle = [...path.slice(start), id]
      const key = [...new Set(cycle)].sort().join('\u0000')
      if (!reported.has(key)) {
        reported.add(key)
        const owner = strategies.get(id)
        issues.push(surgeIssue(
          'SURGE_NATIVE_STRATEGY_CYCLE', 'error', 'strategy',
          `Target-native strategy cycle detected: ${cycle.join(' → ')}.`, owner?.id ?? id,
        ))
      }
      return
    }
    if (visited.has(id)) return
    const strategy = strategies.get(id)
    if (!strategy) return
    visiting.add(id)
    const references = strategy.kind === 'subnet'
      ? [strategy.defaultPolicy, ...strategy.conditions.map((condition) => condition?.policy)]
      : []
    for (const reference of references) {
      if (isPolicyReference(reference) && reference.kind === 'strategy' && strategies.has(reference.id)) {
        visit(reference.id, [...path, id])
      }
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of strategies.keys()) visit(id, [])
}

function validatePolicyReference(
  reference: PolicyReference,
  owner: TargetNativeStrategyIR,
  endpointById: Map<string, ProxyEndpointIR>,
  strategyIds: Set<string>,
  nativeIds: Set<string>,
  issues: CompatibilityIssue[],
  location: string,
) {
  if (reference.kind === 'builtin') {
    if (reference.id !== 'DIRECT' && reference.id !== 'REJECT') issues.push(surgeIssue(
      'SURGE_SUBNET_BUILTIN_UNSUPPORTED', 'error', 'strategy', `Subnet strategy “${owner.name}” uses an unsupported built-in policy.`, owner.id,
    ))
    return
  }
  if (reference.kind === 'proxy') {
    const endpoint = endpointById.get(reference.id)
    if (!endpoint || isUnmodeledProxy(endpoint)) issues.push(surgeIssue(
      'SURGE_NATIVE_PROXY_REFERENCE_NOT_FOUND', 'error', 'strategy', `Subnet strategy “${owner.name}” ${location} references a missing or unmodeled proxy “${reference.id}”.`, owner.id,
    ))
    else issues.push(...checkSurgeProxy(endpoint, owner.id))
    return
  }
  if (!strategyIds.has(reference.id) && !nativeIds.has(reference.id)) issues.push(surgeIssue(
    'SURGE_NATIVE_STRATEGY_REFERENCE_NOT_FOUND', 'error', 'strategy', `Subnet strategy “${owner.name}” ${location} references missing strategy “${reference.id}”.`, owner.id,
  ))
  if (reference.id === owner.id) issues.push(surgeIssue(
    'SURGE_NATIVE_STRATEGY_CYCLE', 'error', 'strategy', `Target-native strategy “${owner.name}” references itself.`, owner.id,
  ))
}

export function compileSurgeNativeStrategies(
  nativeStrategies: readonly TargetNativeStrategyIR[],
  context: SurgeCompileContext,
) {
  for (const strategy of nativeStrategies) {
    if (!strategy || typeof strategy.id !== 'string' || typeof strategy.name !== 'string' || !isTargetNativeStrategyConfig(strategy)) continue
    const entry = strategy.kind === 'smart'
      ? compileSmart(strategy, context)
      : compileSubnet(strategy, context)
    if (!entry) continue
    context.proxyGroups.push(entry)
    context.strategyNames.set(strategy.id, strategy.name)
    context.compiledStrategyIds.add(strategy.id)
  }
}

function compileSmart(strategy: Extract<TargetNativeStrategyIR, { kind: 'smart' }>, context: SurgeCompileContext): SurgeSmartPolicyEntry | undefined {
  const members = strategy.members.flatMap((reference) => {
    const endpoint = allEndpoints(context.ir).get(reference.id)
    return endpoint && !isUnmodeledProxy(endpoint) ? [registerSurgeProxy(endpoint, context)] : []
  })
  if (members.length === 0) return undefined
  return { name: strategy.name, type: 'smart', arguments: members }
}

function compileSubnet(strategy: Extract<TargetNativeStrategyIR, { kind: 'subnet' }>, context: SurgeCompileContext): SurgeSubnetPolicyEntry | undefined {
  const defaultPolicy = compilePolicyReference(strategy.defaultPolicy, context)
  if (!defaultPolicy) return undefined
  const argumentsList: string[] = []
  for (const condition of strategy.conditions) {
    const policy = compilePolicyReference(condition.policy, context)
    if (!policy) continue
    argumentsList.push(subnetMatcherExpression(condition.matcher), policy)
  }
  argumentsList.push('default', defaultPolicy)
  return { name: strategy.name, type: 'subnet', arguments: argumentsList }
}

function compilePolicyReference(reference: PolicyReference, context: SurgeCompileContext) {
  if (reference.kind === 'builtin') return reference.id
  if (reference.kind === 'strategy') return context.strategyNames.get(reference.id)
  const endpoint = allEndpoints(context.ir).get(reference.id)
  return endpoint && !isUnmodeledProxy(endpoint) ? registerSurgeProxy(endpoint, context) : undefined
}

function allEndpoints(ir: ProxyFlowIR) {
  const endpoints = new Map<string, ProxyEndpointIR>()
  for (const source of ir.sources) {
    if (source.kind !== 'manual-proxy' && source.kind !== 'subscription') continue
    for (const endpoint of source.proxies ?? []) if (!endpoints.has(endpoint.id)) endpoints.set(endpoint.id, endpoint)
  }
  return endpoints
}

function isSurgeMatcher(value: unknown): value is Extract<TargetNativeStrategyIR, { kind: 'subnet' }>['conditions'][number]['matcher'] {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.value !== 'string' || !candidate.value.trim() || /[\r\n\u0000-\u001f\u007f]/.test(candidate.value)) return false
  if (candidate.kind === 'ssid' || candidate.kind === 'bssid' || candidate.kind === 'router') return true
  return candidate.kind === 'network-type' && ['WIFI', 'WIRED', 'CELLULAR'].includes(candidate.value)
}

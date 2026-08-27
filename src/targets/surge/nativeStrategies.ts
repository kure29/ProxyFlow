import type { ProxyFlowIR, ProxyEndpointIR } from '../../core/ir'
import {
  isPolicyReference, isTargetNativeStrategyIR, isValidSurgeMccmnc, subnetMatcherExpression,
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
  const seenIds = new Set<string>()
  const names = new Map<string, string>()
  for (const strategy of nativeStrategies) {
    if (!strategy || !isTargetNativeStrategyIR(strategy)) {
      reportMalformedStrategySemantics(strategy, issues)
      const raw = strategy as unknown as { id?: unknown }
      issues.push(surgeIssue(
        'TARGET_NATIVE_STRATEGY_INVALID', 'error', 'strategy', 'A target-native strategy contains invalid typed configuration.', typeof raw?.id === 'string' ? raw.id : undefined,
      ))
      continue
    }
    if (seenIds.has(strategy.id)) issues.push(surgeIssue(
      'SURGE_NATIVE_STRATEGY_ID_DUPLICATE', 'error', 'strategy',
      `Target-native strategy id “${strategy.id}” occurs more than once and cannot be lowered deterministically.`, strategy.id,
    ))
    seenIds.add(strategy.id)
    if (strategyIds.has(strategy.id)) issues.push(surgeIssue(
      'SURGE_NATIVE_STRATEGY_ID_COLLISION', 'error', 'strategy',
      `Target-native strategy id “${strategy.id}” collides with a Universal strategy id.`, strategy.id,
    ))
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
      validateSmartParameters(strategy, issues)
    } else {
      if (!isPolicyReference(strategy.defaultPolicy)) issues.push(surgeIssue(
        isUnsupportedBuiltinReference(strategy.defaultPolicy) ? 'SURGE_SUBNET_BUILTIN_UNSUPPORTED' : 'SURGE_SUBNET_DEFAULT_REQUIRED',
        'error', 'strategy', `Subnet strategy “${strategy.name}” requires a supported default policy reference.`, strategy.id,
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
            isUnsupportedBuiltinReference(condition.policy) ? 'SURGE_SUBNET_BUILTIN_UNSUPPORTED' : 'SURGE_SUBNET_POLICY_INVALID',
            'error', 'strategy', `Subnet strategy “${strategy.name}” condition ${index + 1} has no valid policy target.`, strategy.id,
          ))
          return
        }
        validatePolicyReference(condition.policy, strategy, endpointById, strategyIds, nativeIds, issues, `condition ${index + 1}`)
      })
    }
  }
  validateNativeStrategyCycles(nativeStrategies, issues)
}

/**
 * Preserve useful semantic diagnostics for malformed runtime records while
 * keeping the exact-shape guard authoritative for admission to compilation.
 */
function reportMalformedStrategySemantics(strategy: unknown, issues: CompatibilityIssue[]) {
  if (!strategy || typeof strategy !== 'object') return
  const raw = strategy as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name : 'Unnamed'
  const id = typeof raw.id === 'string' ? raw.id : undefined
  if (raw.kind === 'smart' && Array.isArray(raw.members)) {
    for (const member of raw.members) if (!isPolicyReference(member) || member.kind !== 'proxy') issues.push(surgeIssue(
      'SURGE_SMART_MEMBER_UNSUPPORTED', 'error', 'strategy',
      `Smart strategy “${name}” accepts proxy endpoints only; malformed or ${isPolicyReference(member) ? member.kind : 'unknown'} policies are not valid candidates.`, id,
    ))
    return
  }
  if (raw.kind !== 'subnet') return
  if (!isPolicyReference(raw.defaultPolicy)) issues.push(surgeIssue(
    isUnsupportedBuiltinReference(raw.defaultPolicy) ? 'SURGE_SUBNET_BUILTIN_UNSUPPORTED' : 'SURGE_SUBNET_DEFAULT_REQUIRED',
    'error', 'strategy', `Subnet strategy “${name}” requires a supported default policy reference.`, id,
  ))
  if (!Array.isArray(raw.conditions)) return
  raw.conditions.forEach((condition, index) => {
    const candidate = condition as Record<string, unknown> | null
    if (!candidate || !isSurgeMatcher(candidate.matcher)) issues.push(surgeIssue(
      'SURGE_SUBNET_MATCHER_INVALID', 'error', 'strategy',
      `Subnet strategy “${name}” condition ${index + 1} has a missing or invalid matcher value.`, id,
    ))
    if (!candidate || !isPolicyReference(candidate.policy)) issues.push(surgeIssue(
      isUnsupportedBuiltinReference(candidate?.policy) ? 'SURGE_SUBNET_BUILTIN_UNSUPPORTED' : 'SURGE_SUBNET_POLICY_INVALID',
      'error', 'strategy', `Subnet strategy “${name}” condition ${index + 1} has no valid policy target.`, id,
    ))
  })
}

function validateNativeStrategyCycles(
  nativeStrategies: readonly TargetNativeStrategyIR[],
  issues: CompatibilityIssue[],
) {
  const strategies = new Map(nativeStrategies.flatMap((strategy) => {
    if (!strategy || !isTargetNativeStrategyIR(strategy)) return []
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
  const validStrategies = nativeStrategies.filter((strategy): strategy is TargetNativeStrategyIR => Boolean(
    strategy && isTargetNativeStrategyIR(strategy),
  )).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  // Register every native name before compiling any entry so references are
  // independent of the physical node/array order in the Project graph.
  for (const strategy of validStrategies) context.strategyNames.set(strategy.id, strategy.name)
  for (const strategy of validStrategies) {
    const entry = strategy.kind === 'smart'
      ? compileSmart(strategy, context)
      : compileSubnet(strategy, context)
    if (!entry) continue
    context.proxyGroups.push(entry)
    context.compiledStrategyIds.add(strategy.id)
  }
}

function compileSmart(strategy: Extract<TargetNativeStrategyIR, { kind: 'smart' }>, context: SurgeCompileContext): SurgeSmartPolicyEntry | undefined {
  const members = strategy.members.flatMap((reference) => {
    const endpoint = allEndpoints(context.ir).get(reference.id)
    return endpoint && !isUnmodeledProxy(endpoint) ? [registerSurgeProxy(endpoint, context)] : []
  })
  if (members.length === 0) return undefined
  return {
    name: strategy.name,
    type: 'smart',
    arguments: members,
    ...(strategy.policyPriority?.length ? { policyPriority: strategy.policyPriority.map(({ pattern, factor }) => ({ pattern, factor })) } : {}),
    ...(strategy.evaluateBeforeUse === undefined ? {} : { evaluateBeforeUse: strategy.evaluateBeforeUse }),
  }
}

function compileSubnet(strategy: Extract<TargetNativeStrategyIR, { kind: 'subnet' }>, context: SurgeCompileContext): SurgeSubnetPolicyEntry | undefined {
  const defaultPolicy = compilePolicyReference(strategy.defaultPolicy, context)
  if (!defaultPolicy) return undefined
  const conditions: SurgeSubnetPolicyEntry['conditions'] = []
  for (const condition of strategy.conditions) {
    const policy = compilePolicyReference(condition.policy, context)
    if (!policy) continue
    conditions.push({ expression: subnetMatcherExpression(condition.matcher), policy })
  }
  return { name: strategy.name, type: 'subnet', arguments: [], defaultPolicy, conditions }
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
  if (candidate.kind === 'ssid') return true
  if (candidate.kind === 'bssid') return isValidBssid(candidate.value)
  if (candidate.kind === 'router') return isValidRouter(candidate.value)
  if (candidate.kind === 'mccmnc') return isValidSurgeMccmnc(candidate.value)
  return candidate.kind === 'network-type' && ['WIFI', 'WIRED', 'CELLULAR'].includes(candidate.value)
}

function isValidBssid(value: string) {
  return /^(?:[0-9a-f?*]{1,2}:){5}[0-9a-f?*]{1,2}$/i.test(value)
}

function isValidRouter(value: string) {
  const octets = value.split('.')
  if (octets.length === 4 && octets.every((octet) => /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)) return true
  const groups = value.split(':')
  return value.includes(':')
    && (value.includes('::') ? groups.length <= 8 : groups.length === 8)
    && groups.every((group) => group.length <= 4 && /^[0-9a-f]*$/i.test(group))
    && (value.includes('::') || groups.filter(Boolean).length === 8)
}

function isUnsupportedBuiltinReference(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.kind === 'builtin'
    && typeof candidate.id === 'string'
    && candidate.id !== 'DIRECT'
    && candidate.id !== 'REJECT'
}

function validateSmartParameters(
  strategy: Extract<TargetNativeStrategyIR, { kind: 'smart' }>,
  issues: CompatibilityIssue[],
) {
  if (strategy.evaluateBeforeUse !== undefined && typeof strategy.evaluateBeforeUse !== 'boolean') issues.push(surgeIssue(
    'SURGE_SMART_EVALUATE_BEFORE_USE_INVALID', 'error', 'strategy',
    `Smart strategy “${strategy.name}” has an invalid evaluate-before-use value.`, strategy.id,
  ))
  if (strategy.policyPriority === undefined) return
  if (!Array.isArray(strategy.policyPriority) || strategy.policyPriority.length === 0) {
    issues.push(surgeIssue(
      'SURGE_SMART_POLICY_PRIORITY_INVALID', 'error', 'strategy',
      `Smart strategy “${strategy.name}” policy-priority must contain at least one regex factor rule.`, strategy.id,
    ))
    return
  }
  for (const [index, rule] of strategy.policyPriority.entries()) {
    if (!rule || typeof rule.pattern !== 'string' || !rule.pattern.trim() || /[\r\n\u0000-\u001f\u007f]/.test(rule.pattern)) {
      issues.push(surgeIssue(
        'SURGE_SMART_POLICY_PRIORITY_INVALID', 'error', 'strategy',
        `Smart strategy “${strategy.name}” policy-priority rule ${index + 1} has an invalid regex pattern.`, strategy.id,
      ))
      continue
    }
    try { new RegExp(rule.pattern) } catch {
      issues.push(surgeIssue(
        'SURGE_SMART_POLICY_PRIORITY_INVALID', 'error', 'strategy',
        `Smart strategy “${strategy.name}” policy-priority rule ${index + 1} has an invalid regex pattern.`, strategy.id,
      ))
    }
    if (typeof rule.factor !== 'number' || !Number.isFinite(rule.factor) || rule.factor <= 0) issues.push(surgeIssue(
      'SURGE_SMART_POLICY_PRIORITY_INVALID', 'error', 'strategy',
      `Smart strategy “${strategy.name}” policy-priority rule ${index + 1} must use a positive finite factor.`, strategy.id,
    ))
  }
}

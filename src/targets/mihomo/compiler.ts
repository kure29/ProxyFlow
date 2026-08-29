import { validateIR } from '../../core/semanticValidation'
import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { ProxyFlowIR } from '../../core/ir'
import type { CompileResult, ConfigCompiler, TargetCompileOptions } from '../../core/compiler/compilerTypes'
import { compileMihomoChains } from './chain'
import { checkMihomoCompatibility } from './compatibility'
import { createMihomoContext } from './context'
import { compileMihomoDns, resolveMihomoDnsOwnership } from './dns'
import { mihomoIssue } from './errors'
import type { MihomoConfig, MihomoSnifferConfig, MihomoTunConfig } from './model'
import { validateMihomoOutputProfile } from './profile'
import { resolveMihomoEffectiveTargetSettings, validateMihomoTargetSettings } from './settings'
import { compileMihomoProviders } from './providers'
import { compileMihomoRules } from './rules'
import { serializeMihomoConfig } from './serializer'
import { compileMihomoStrategies } from './strategies'
import { targetNativeUnsupportedIssues, type TargetNativeFinalOptionsIR, type TargetNativeSurgeDnsBehaviorIR, type TargetNativeSurgeGeneralConnectivityIR, type TargetNativeSurgeGeneralNetworkIR, type TargetNativeSurgeGeneralProxyBypassIR } from '../../core/targetNative'

export interface MihomoCompileOptions {
  now?: () => Date
  outputNodeId?: string
  profile?: unknown
  targetSettings?: import('../../types/targetSettings').TargetSettings
  targetNativeStrategies?: import('../../core/targetNative').TargetNativeStrategyIR[]
  nativeStrategies?: import('../../core/targetNative').TargetNativeStrategyIR[]
  nativeRoutes?: import('../../core/targetNative').TargetNativeRouteIR[]
  nativeFinalRoute?: import('../../core/targetNative').TargetNativeFinalRouteIR
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR
  targetNativeRouteOptions?: import('../../core/targetNative').TargetNativeRouteOptionsIR[]
  nativeRouteOptions?: import('../../core/targetNative').TargetNativeRouteOptionsIR[]
  targetNativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]
  nativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]
  targetNativeSurgeGeneralNetwork?: TargetNativeSurgeGeneralNetworkIR
  targetNativeSurgeGeneralConnectivity?: TargetNativeSurgeGeneralConnectivityIR
  targetNativeSurgeGeneralProxyBypass?: TargetNativeSurgeGeneralProxyBypassIR
  targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorIR
  effectiveDnsNodeId?: string
}

export function compileMihomo(ir: ProxyFlowIR, options: MihomoCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir)
  const issues = irIssues.map((issue) => mihomoIssue(
    `IR_${issue.code}`,
    issue.severity,
    'ir',
    issue.message,
    issue.entity?.id ?? issue.nodeId,
  ))
  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const nativeRuleSetSources = options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? []
  issues.push(...targetNativeUnsupportedIssues('mihomo', nativeStrategies, options.nativeRoutes ?? [], nativeRuleSetSources, options.targetNativeFinalOptions, options.targetNativeRouteOptions ?? options.nativeRouteOptions, options.nativeFinalRoute, options.targetNativeSurgeGeneralNetwork, options.outputNodeId, ir.outputs, options.targetNativeSurgeGeneralConnectivity, options.targetNativeSurgeDnsBehavior, options.effectiveDnsNodeId, options.targetNativeSurgeGeneralProxyBypass))
  const managedSettings = validateMihomoTargetSettings(options.targetSettings?.mihomo, options.outputNodeId ?? 'mihomo-settings')
  issues.push(...managedSettings.issues)
  const outputProfile = validateMihomoOutputProfile(options.profile, Boolean(ir.dns?.enabled), options.outputNodeId)
  issues.push(...outputProfile.issues)
  const effectiveSettings = resolveMihomoEffectiveTargetSettings(managedSettings.settings, outputProfile.profile)
  const profile = { ...outputProfile.profile, ...effectiveSettings }
  const compatibility = checkMihomoCompatibility(ir)
  issues.push(...compatibility.issues)
  if (issues.some((issue) => issue.severity === 'error')) return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }

  const context = createMihomoContext(ir, issues)
  compileMihomoProviders(context)
  compileMihomoStrategies(context)
  compileMihomoChains(context)
  const rules = compileMihomoRules(context)
  const dnsOwnership = resolveMihomoDnsOwnership(ir.dns, {
    dnsMode: profile.dnsMode,
    ipv6: effectiveSettings.ipv6,
  })
  const dns = compileMihomoDns(dnsOwnership)

  if (issues.some((issue) => issue.severity === 'error')) return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }

  const config: MihomoConfig = {
    'mixed-port': profile.mixedPort,
    'allow-lan': profile.allowLan,
    ipv6: profile.ipv6,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': profile.unifiedDelay,
    'tcp-concurrent': profile.tcpConcurrent,
    profile: {
      'store-selected': profile.storeSelected,
      'store-fake-ip': dns?.['enhanced-mode'] === 'fake-ip',
    },
    ...(profile.preset === 'desktop-tun' ? { tun: compileTun(profile) } : {}),
    ...(profile.sniffer ? { sniffer: compileSniffer() } : {}),
    ...(context.proxies.size > 0 ? { proxies: [...context.proxies.values()] } : {}),
    ...(context.providers.size > 0 ? { 'proxy-providers': Object.fromEntries(context.providers) } : {}),
    ...(context.groups.length > 0 ? { 'proxy-groups': context.groups } : {}),
    ...(context.ruleProviders.size > 0 ? { 'rule-providers': Object.fromEntries(context.ruleProviders) } : {}),
    rules,
    ...(dns ? { dns } : {}),
  }
  return {
    success: true,
    content: serializeMihomoConfig(config),
    issues: deduplicateDiagnostics(issues),
    generatedAt,
    mock: false,
    stats: { proxyCount: context.proxies.size, endpointCount: context.compiledEndpointIds.size },
  }
}

export class MihomoCompiler implements ConfigCompiler {
  readonly target = 'mihomo' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR, options?: TargetCompileOptions) {
    return compileMihomo(ir, { now: this.now, outputNodeId: options?.outputNodeId, profile: options?.targetProfile, targetSettings: options?.targetSettings, targetNativeStrategies: options?.targetNativeStrategies, nativeStrategies: options?.nativeStrategies, nativeRoutes: options?.nativeRoutes, nativeFinalRoute: options?.nativeFinalRoute, targetNativeFinalOptions: options?.targetNativeFinalOptions, targetNativeRouteOptions: options?.targetNativeRouteOptions, nativeRouteOptions: options?.nativeRouteOptions, targetNativeRuleSetSources: options?.targetNativeRuleSetSources, nativeRuleSetSources: options?.nativeRuleSetSources, targetNativeSurgeGeneralNetwork: options?.targetNativeSurgeGeneralNetwork, targetNativeSurgeGeneralConnectivity: options?.targetNativeSurgeGeneralConnectivity, targetNativeSurgeGeneralProxyBypass: options?.targetNativeSurgeGeneralProxyBypass, targetNativeSurgeDnsBehavior: options?.targetNativeSurgeDnsBehavior, effectiveDnsNodeId: options?.effectiveDnsNodeId })
  }
}

function compileTun(profile: ReturnType<typeof validateMihomoOutputProfile>['profile']): MihomoTunConfig {
  return {
    enable: true,
    stack: profile.tunStack,
    'auto-route': true,
    'auto-detect-interface': true,
    'dns-hijack': ['any:53', 'tcp://any:53'],
    'strict-route': profile.strictRoute,
  }
}

function compileSniffer(): MihomoSnifferConfig {
  return {
    enable: true,
    'force-dns-mapping': true,
    'parse-pure-ip': true,
    'override-destination': false,
    sniff: {
      HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] },
    },
  }
}

import { validateIR } from '../../core/semanticValidation'
import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { ProxyFlowIR } from '../../core/ir'
import type { CompileResult, ConfigCompiler, TargetCompileOptions } from '../../core/compiler/compilerTypes'
import { compileMihomoChains } from './chain'
import { checkMihomoCompatibility } from './compatibility'
import { createMihomoContext } from './context'
import { compileMihomoDns } from './dns'
import { mihomoIssue } from './errors'
import type { MihomoConfig, MihomoSnifferConfig, MihomoTunConfig } from './model'
import { validateMihomoOutputProfile } from './profile'
import { compileMihomoProviders } from './providers'
import { compileMihomoRules } from './rules'
import { serializeMihomoConfig } from './serializer'
import { compileMihomoStrategies } from './strategies'
import { targetNativeUnsupportedIssues, type TargetNativeFinalOptionsIR } from '../../core/targetNative'

export interface MihomoCompileOptions {
  now?: () => Date
  outputNodeId?: string
  profile?: unknown
  targetNativeStrategies?: import('../../core/targetNative').TargetNativeStrategyIR[]
  nativeStrategies?: import('../../core/targetNative').TargetNativeStrategyIR[]
  nativeRoutes?: import('../../core/targetNative').TargetNativeRouteIR[]
  nativeFinalRoute?: import('../../core/targetNative').TargetNativeFinalRouteIR
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR
  targetNativeRouteOptions?: import('../../core/targetNative').TargetNativeRouteOptionsIR[]
  nativeRouteOptions?: import('../../core/targetNative').TargetNativeRouteOptionsIR[]
  targetNativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]
  nativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]
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
  issues.push(...targetNativeUnsupportedIssues('mihomo', nativeStrategies, options.nativeRoutes ?? [], nativeRuleSetSources, options.targetNativeFinalOptions, options.targetNativeRouteOptions ?? options.nativeRouteOptions, options.nativeFinalRoute))
  const outputProfile = validateMihomoOutputProfile(options.profile, Boolean(ir.dns?.enabled), options.outputNodeId)
  issues.push(...outputProfile.issues)
  const compatibility = checkMihomoCompatibility(ir)
  issues.push(...compatibility.issues)
  if (issues.some((issue) => issue.severity === 'error')) return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }

  const context = createMihomoContext(ir, issues)
  compileMihomoProviders(context)
  compileMihomoStrategies(context)
  compileMihomoChains(context)
  const rules = compileMihomoRules(context)
  const dns = compileMihomoDns(ir.dns, outputProfile.profile.dnsMode, outputProfile.profile.ipv6)

  if (issues.some((issue) => issue.severity === 'error')) return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }

  const config: MihomoConfig = {
    'mixed-port': outputProfile.profile.mixedPort,
    'allow-lan': outputProfile.profile.allowLan,
    ipv6: outputProfile.profile.ipv6,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': outputProfile.profile.unifiedDelay,
    'tcp-concurrent': outputProfile.profile.tcpConcurrent,
    profile: {
      'store-selected': outputProfile.profile.storeSelected,
      'store-fake-ip': dns?.['enhanced-mode'] === 'fake-ip',
    },
    ...(outputProfile.profile.preset === 'desktop-tun' ? { tun: compileTun(outputProfile.profile) } : {}),
    ...(outputProfile.profile.sniffer ? { sniffer: compileSniffer() } : {}),
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
    return compileMihomo(ir, { now: this.now, outputNodeId: options?.outputNodeId, profile: options?.targetProfile, targetNativeStrategies: options?.targetNativeStrategies, nativeStrategies: options?.nativeStrategies, nativeRoutes: options?.nativeRoutes, nativeFinalRoute: options?.nativeFinalRoute, targetNativeFinalOptions: options?.targetNativeFinalOptions, targetNativeRouteOptions: options?.targetNativeRouteOptions, nativeRouteOptions: options?.nativeRouteOptions, targetNativeRuleSetSources: options?.targetNativeRuleSetSources, nativeRuleSetSources: options?.nativeRuleSetSources })
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

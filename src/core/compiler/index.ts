import { proxyCompatibilityForTarget } from '../capabilities/proxyCompatibility'
import { targetCapabilityRegistry } from '../capabilities/targetCapabilities'
import { targetNativeUnsupportedIssues } from '../targetNative'
import { collectSurgeNativeCapabilityEvidence } from '../targetNative/capabilityEvidence'
import { targetRegistry, type CompilerLoader, type TargetAdapter, type TargetCompatibilityProvider } from './compilerTypes'

const registerTarget = (
  target: keyof typeof targetCapabilityRegistry,
  compatibility: TargetCompatibilityProvider,
  compiler: CompilerLoader,
  extras: Pick<TargetAdapter, 'nativeCapabilityEvidence' | 'nativeCompatibility'> = {},
) => targetRegistry.register({
  target,
  capabilities: targetCapabilityRegistry[target],
  proxyCompatibility: (proxy) => proxyCompatibilityForTarget(proxy, target),
  compatibility,
  compiler,
  ...extras,
})

const nativeCompatibilityFor = (target: keyof typeof targetCapabilityRegistry): TargetCompatibilityProvider | undefined => target === 'surge'
  ? undefined
  : (ir, options = {}) => targetNativeUnsupportedIssues(
    target,
    options.targetNativeStrategies ?? options.nativeStrategies ?? [],
    options.nativeRoutes ?? [],
    options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? [],
    options.targetNativeFinalOptions,
    options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? [],
    options.nativeFinalRoute,
    options.targetNativeSurgeGeneralNetwork,
    options.outputNodeId,
    ir.outputs,
    options.targetNativeSurgeGeneralConnectivity,
    options.targetNativeSurgeDnsBehavior,
    options.effectiveDnsNodeId,
    options.targetNativeSurgeGeneralProxyBypass,
  )

registerTarget('mihomo', async (ir) => {
  const { checkMihomoCompatibility } = await import('../../targets/mihomo/compatibility')
  return (await checkMihomoCompatibility(ir)).issues
}, async () => {
  const { MihomoCompiler } = await import('../../targets/mihomo')
  return new MihomoCompiler()
}, { nativeCompatibility: nativeCompatibilityFor('mihomo') })

registerTarget('sing-box', async (ir) => {
  const { checkSingBoxCompatibility } = await import('../../targets/singbox/compatibility')
  return (await checkSingBoxCompatibility(ir)).issues
}, async () => {
  const { SingBoxCompiler } = await import('../../targets/singbox')
  return new SingBoxCompiler()
}, { nativeCompatibility: nativeCompatibilityFor('sing-box') })

registerTarget('surge', async (ir, options = {}) => {
  const { checkSurgeCompatibility } = await import('../../targets/surge/compatibility')
  return checkSurgeCompatibility(
    ir,
    undefined,
    options.targetNativeStrategies ?? options.nativeStrategies ?? [],
    options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? [],
    options.nativeRoutes ?? [],
    options.nativeFinalRoute,
    options.targetNativeFinalOptions,
    options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? [],
    options.effectiveFinalNodeId,
  ).issues
}, async () => {
  const { SurgeCompiler } = await import('../../targets/surge')
  return new SurgeCompiler()
}, { nativeCapabilityEvidence: collectSurgeNativeCapabilityEvidence })

registerTarget('loon', async (ir) => {
  const { checkLoonCompatibility } = await import('../../targets/loon/compatibility')
  return (await checkLoonCompatibility(ir)).issues
}, async () => {
  const { LoonCompiler } = await import('../../targets/loon')
  return new LoonCompiler()
}, { nativeCompatibility: nativeCompatibilityFor('loon') })

registerTarget('shadowrocket', async (ir) => {
  const { checkShadowrocketCompatibility } = await import('../../targets/shadowrocket/compatibility')
  return (await checkShadowrocketCompatibility(ir)).issues
}, async () => {
  const { ShadowrocketCompiler } = await import('../../targets/shadowrocket')
  return new ShadowrocketCompiler()
}, { nativeCompatibility: nativeCompatibilityFor('shadowrocket') })

export * from './compilerTypes'
export * from './diagnostics'

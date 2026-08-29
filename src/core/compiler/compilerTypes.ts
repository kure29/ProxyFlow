import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { ProxyFlowIR } from '../ir'
import type { ResolvedProxyEndpointIR } from '../proxy'
import { isPrimaryTarget, targetCapabilityRegistry, type PrimaryTarget, type TargetCapabilityProfile } from '../capabilities/targetCapabilities'
import type { TargetNativeFinalOptionsIR, TargetNativeFinalRouteIR, TargetNativeRouteIR, TargetNativeRouteOptionsIR, TargetNativeRuleSetSourceIR, TargetNativeStrategyIR, TargetNativeSurgeDnsBehaviorIR, TargetNativeSurgeGeneralConnectivityIR, TargetNativeSurgeGeneralNetworkIR, TargetNativeSurgeGeneralProxyBypassIR } from '../targetNative'
import type { TargetNativeCapabilityEvidenceProvider } from '../targetNative/capabilityEvidence'

export type TargetProjectionStatus = 'ready' | 'partial' | 'blocked'

export interface TargetProjectionReason {
  code: string
  label: string
  /** Number of distinct projected endpoints affected by this reason. */
  endpointCount: number
}

export interface TargetStrategyProjectionSummary {
  target: TargetClient
  strategyId: string
  candidateCount: number
  compatibleCount: number
  skippedCount: number
  blockingCount: number
  status: TargetProjectionStatus
  reasons: TargetProjectionReason[]
}

/** Target-specific compatibility for one materialized endpoint. */
export interface TargetEndpointProjectionSummary {
  target: TargetClient
  endpointId: string
  sourceId?: string
  candidateCount: number
  compatibleCount: number
  skippedCount: number
  status: TargetProjectionStatus
  reasons: TargetProjectionReason[]
}

export interface TargetProjectionSummary {
  target: TargetClient
  candidateCount: number
  compatibleCount: number
  skippedCount: number
  blockingCount: number
  status: TargetProjectionStatus
  reasons: TargetProjectionReason[]
  strategies: TargetStrategyProjectionSummary[]
  /** Optional endpoint-level details for node workspace presentation. */
  endpoints?: TargetEndpointProjectionSummary[]
}

export interface CompileResult {
  success: boolean
  content: string
  issues: CompatibilityIssue[]
  /** Optional target-specific projection data for workspace diagnostics. */
  targetProjection?: TargetProjectionSummary
  generatedAt: string
  mock: boolean
  stats?: {
    proxyCount: number
    endpointCount?: number
    candidateCount?: number
    compatibleEndpointCount?: number
    skippedEndpointCount?: number
    blockingIssueCount?: number
  }
}

export interface TargetCompileOptions {
  outputNodeId?: string
  targetProfile?: unknown
  /** Explicit target-native extension extracted from the Project graph. */
  targetNativeStrategies?: TargetNativeStrategyIR[]
  /** Short alias accepted by headless integrations. */
  nativeStrategies?: TargetNativeStrategyIR[]
  nativeRoutes?: TargetNativeRouteIR[]
  nativeFinalRoute?: TargetNativeFinalRouteIR
  /** Compiler-owned Project Final node identity used to bind Final options. */
  effectiveFinalNodeId?: string
  /** Compiler-owned effective DNS node identity used to bind DNS-native options. */
  effectiveDnsNodeId?: string
  /** Explicit target-native Final rule options extracted from the Project graph. */
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR
  /** Explicit target-native route options extracted from the Project graph. */
  targetNativeRouteOptions?: TargetNativeRouteOptionsIR[]
  /** Short alias accepted by headless integrations. */
  nativeRouteOptions?: TargetNativeRouteOptionsIR[]
  /** Explicit target-native Rule Set provenance extracted from the graph. */
  targetNativeRuleSetSources?: TargetNativeRuleSetSourceIR[]
  /** Short alias accepted by headless integrations. */
  nativeRuleSetSources?: TargetNativeRuleSetSourceIR[]
  /** Exact Output-owned Surge General Network/VIF extension. */
  targetNativeSurgeGeneralNetwork?: TargetNativeSurgeGeneralNetworkIR
  targetNativeSurgeGeneralConnectivity?: TargetNativeSurgeGeneralConnectivityIR
  targetNativeSurgeGeneralProxyBypass?: TargetNativeSurgeGeneralProxyBypassIR
  targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorIR
}

export interface ConfigCompiler {
  target: TargetClient
  compile(ir: ProxyFlowIR, options?: TargetCompileOptions): Promise<CompileResult>
}

export type CompilerLoader = () => Promise<ConfigCompiler>

export type TargetCompatibilityProvider = (ir: ProxyFlowIR, options?: TargetCompileOptions) => Promise<CompatibilityIssue[]> | CompatibilityIssue[]
export type TargetProxyCompatibilityProvider = (proxy: ResolvedProxyEndpointIR) => {
  status: 'supported' | 'partial' | 'unsupported' | 'target-native'
  unsupportedFeatures: string[]
}

export interface TargetAdapter {
  /** Stable target identifier owned by the adapter registration. */
  target: PrimaryTarget
  /** Declarative target capability evidence exposed at the universal boundary. */
  capabilities: TargetCapabilityProfile
  /** Target-specific endpoint compatibility evidence. */
  proxyCompatibility: TargetProxyCompatibilityProvider
  /** Target-specific IR compatibility evidence. */
  compatibility: TargetCompatibilityProvider
  /** Target-native extension compatibility owned by this target boundary. */
  nativeCompatibility?: TargetCompatibilityProvider
  /** Optional target-native capability evidence owned by this adapter. */
  nativeCapabilityEvidence?: TargetNativeCapabilityEvidenceProvider
  /** Lazy target compiler; serialization remains inside that compiler. */
  compiler: CompilerLoader
}

/**
 * Single registration point for target capabilities, compatibility, and
 * compilation.  CompilerRegistry is retained as a type/name alias below for
 * existing callers while all registrations are stored as TargetAdapters.
 */
export class TargetRegistry {
  private adapters = new Map<PrimaryTarget, TargetAdapter>()
  private compilers = new Map<PrimaryTarget, ConfigCompiler>()
  private pending = new Map<PrimaryTarget, Promise<ConfigCompiler>>()

  register(adapter: TargetAdapter): boolean
  /** Backward-compatible compiler-only registration for existing integrations. */
  register(target: TargetClient, loader: CompilerLoader): boolean
  register(adapterOrTarget: TargetAdapter | TargetClient, loader?: CompilerLoader): boolean {
    const adapter = typeof adapterOrTarget === 'string'
      ? createLegacyAdapter(adapterOrTarget, loader)
      : adapterOrTarget
    if (!isTargetAdapter(adapter) || this.adapters.has(adapter.target)) return false
    this.adapters.set(adapter.target, adapter)
    return true
  }

  get(target: TargetClient): TargetAdapter | undefined {
    return isPrimaryTarget(target) ? this.adapters.get(target) : undefined
  }

  has(target: TargetClient) {
    return this.get(target) !== undefined
  }

  getLoaded(target: TargetClient) {
    return isPrimaryTarget(target) ? this.compilers.get(target) : undefined
  }

  async load(target: TargetClient) {
    if (!isPrimaryTarget(target)) return undefined
    const loaded = this.compilers.get(target)
    if (loaded) return loaded
    const existing = this.pending.get(target)
    if (existing) return existing
    const adapter = this.adapters.get(target)
    if (!adapter) return undefined
    const pending = adapter.compiler().then((compiler) => {
      if (compiler.target !== target) throw new Error(`Compiler loader for ${target} returned ${compiler.target}.`)
      this.compilers.set(target, compiler)
      this.pending.delete(target)
      return compiler
    }).catch((error) => {
      this.pending.delete(target)
      throw error
    })
    this.pending.set(target, pending)
    return pending
  }
}

function createLegacyAdapter(target: TargetClient, loader?: CompilerLoader): TargetAdapter | undefined {
  if (!loader || !isPrimaryTarget(target)) return undefined
  return {
    target,
    capabilities: targetCapabilityRegistry[target],
    proxyCompatibility: () => ({ status: 'supported', unsupportedFeatures: [] }),
    compatibility: () => [],
    compiler: loader,
  }
}

function isTargetAdapter(value: unknown): value is TargetAdapter {
  if (!value || typeof value !== 'object') return false
  const adapter = value as Partial<TargetAdapter>
  return isPrimaryTarget(adapter.target)
    && adapter.capabilities?.target === adapter.target
    && typeof adapter.proxyCompatibility === 'function'
    && typeof adapter.compatibility === 'function'
    && typeof adapter.compiler === 'function'
}

/** Existing name retained for callers while registration ownership is unified. */
export { TargetRegistry as CompilerRegistry }

export const targetRegistry = new TargetRegistry()
/** Existing compiler API alias; both names reference the same registry instance. */
export const compilerRegistry = targetRegistry

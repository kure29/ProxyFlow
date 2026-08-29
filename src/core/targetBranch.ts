import type { CompatibilityIssue, TargetClient } from '../types/project'
import type { ProxyFlowIR } from './ir'
import { assessIntentCapability, type IntentCapabilityAssessment, type IntentCapabilityAssessmentOptions } from './capabilities/assessment'
import { isPrimaryTarget, type PrimaryTarget, type TargetCapabilityProfile } from './capabilities/targetCapabilities'
import { targetRegistry, type CompileResult, type TargetAdapter, type TargetCompileOptions } from './compiler/compilerTypes'

/**
 * Runtime boundary for one target implementation of a shared policy.
 *
 * A branch owns no graph or persisted state. It is a thin view over the
 * existing TargetAdapter registration, so all targets continue to consume the
 * same Universal IR and the existing capability/compatibility providers.
 */
export interface TargetBranch {
  readonly target: PrimaryTarget
  readonly adapter: TargetAdapter
  readonly capabilities: TargetCapabilityProfile
  readonly proxyCompatibility: TargetAdapter['proxyCompatibility']
  readonly compatibility: (ir: ProxyFlowIR, options?: TargetCompileOptions) => Promise<CompatibilityIssue[]>
  readonly nativeCompatibility?: TargetAdapter['nativeCompatibility']
  readonly nativeCapabilityEvidence?: TargetAdapter['nativeCapabilityEvidence']
  readonly assess: (ir: ProxyFlowIR, options?: IntentCapabilityAssessmentOptions) => Promise<IntentCapabilityAssessment>
  readonly loadCompiler: () => ReturnType<typeof targetRegistry.load>
  readonly compile: (ir: ProxyFlowIR, options?: TargetCompileOptions) => Promise<CompileResult>
}

/**
 * Resolve the registered branch for a target without creating a fallback
 * adapter. Unknown targets and targets without a registration fail closed.
 */
export function getTargetBranch(target: TargetClient | unknown): TargetBranch | undefined {
  if (!isPrimaryTarget(target)) return undefined
  const adapter = targetRegistry.get(target)
  if (!adapter) return undefined
  return createTargetBranch(adapter)
}

/** Return every currently registered target branch in registry order. */
export function listTargetBranches(): TargetBranch[] {
  return targetRegistry.list().map(createTargetBranch)
}

function createTargetBranch(adapter: TargetAdapter): TargetBranch {
  const loadCompiler = () => targetRegistry.load(adapter.target)
  return {
    target: adapter.target,
    adapter,
    capabilities: adapter.capabilities,
    proxyCompatibility: adapter.proxyCompatibility,
    compatibility: async (ir, options) => adapter.compatibility(ir, options),
    nativeCompatibility: adapter.nativeCompatibility,
    nativeCapabilityEvidence: adapter.nativeCapabilityEvidence,
    assess: (ir, options = {}) => assessIntentCapability(ir, adapter.target, options),
    loadCompiler,
    compile: async (ir, options) => {
      const compiler = await loadCompiler()
      if (!compiler) throw new Error(`No compiler is registered for ${adapter.target}.`)
      return compiler.compile(ir, options)
    },
  }
}

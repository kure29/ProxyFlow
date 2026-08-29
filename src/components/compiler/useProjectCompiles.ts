import { useMemo } from 'react'
import { compileGraph } from '../../core/graphCompiler'
import { deduplicateDiagnostics, type StructuredDiagnostic } from '../../core/compiler'
import { localizeSubscriptionSnapshots, translateCurrent, useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'
import {
  getTargetCapabilities, resolveActiveProductTarget, type PrimaryTarget,
} from '../../core/capabilities'
import { useTargetCompile, type TargetCompileState } from './useTargetCompile'
import { selectTargetNativeSurgeGeneralConnectivity, selectTargetNativeSurgeGeneralNetwork, selectTargetNativeSurgeGeneralProxyBypass, type TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'

export interface ProjectCompileSelection {
  mihomo?: boolean
  surge?: boolean
  singBox?: boolean
  loon?: boolean
  shadowrocket?: boolean
  validationTarget?: PrimaryTarget
}

export function resolveProjectCompileSelection(
  primaryTarget: PrimaryTarget | null,
  selection: ProjectCompileSelection = {},
) {
  const activeProductTarget = resolveActiveProductTarget(primaryTarget)
  const loonPrimary = primaryTarget === 'loon'
  const shadowrocketPrimary = primaryTarget === 'shadowrocket'
  return {
    activeProductTarget,
    mihomo: selection.mihomo ?? (!loonPrimary && !shadowrocketPrimary && activeProductTarget === 'mihomo'),
    surge: selection.surge ?? (!loonPrimary && !shadowrocketPrimary && activeProductTarget === 'surge'),
    singBox: selection.singBox ?? false,
    loon: selection.loon ?? primaryTarget === 'loon',
    shadowrocket: selection.shadowrocket ?? shadowrocketPrimary,
  }
}

export function useProjectCompiles(enabled: boolean, selection: ProjectCompileSelection = {}) {
  const { locale } = useI18n()
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const targetSettings = useBuilderStore((state) => state.targetSettings)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const resolvedSelection = resolveProjectCompileSelection(primaryTarget, selection)
  const activeProductTarget = resolvedSelection.activeProductTarget
  const validationTarget = selection.validationTarget ?? (primaryTarget === 'loon' || primaryTarget === 'shadowrocket' ? primaryTarget : activeProductTarget)
  const graphResult = useMemo(() => compileGraph(toProject(), {
    subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale),
    validationTarget,
  }), [edges, locale, nodes, projectId, projectName, subscriptionSnapshots, toProject, validationTarget])
  const mihomoOutput = useMemo(() => resolveMihomoProfileOutput(nodes), [nodes])
  const outputForTarget = (target: PrimaryTarget) => resolveOutputForTarget(nodes, target)
  const surgeOutput = useMemo(() => outputForTarget('surge'), [nodes])
  const loonOutput = useMemo(() => outputForTarget('loon'), [nodes])
  const shadowrocketOutput = useMemo(() => outputForTarget('shadowrocket'), [nodes])
  const singBoxOutput = useMemo(() => outputForTarget('sing-box'), [nodes])
  const g1Records = graphResult.targetNativeSurgeGeneralNetworks
    ?? (graphResult.targetNativeSurgeGeneralNetwork ? [graphResult.targetNativeSurgeGeneralNetwork] : [])
  const g2Records = graphResult.targetNativeSurgeGeneralConnectivityRecords
    ?? (graphResult.targetNativeSurgeGeneralConnectivity ? [graphResult.targetNativeSurgeGeneralConnectivity] : [])
  const g3cRecords = graphResult.targetNativeSurgeGeneralProxyBypasses
    ?? (graphResult.targetNativeSurgeGeneralProxyBypass ? [graphResult.targetNativeSurgeGeneralProxyBypass] : [])
  const mihomoOptions = useMemo(() => ({
    outputNodeId: mihomoOutput?.id,
    targetProfile: mihomoOutput?.data.mihomoProfile,
    targetSettings,
    targetNativeStrategies: graphResult.nativeStrategies ?? [],
    nativeRoutes: graphResult.nativeRoutes ?? [],
    nativeFinalRoute: graphResult.nativeFinalRoute,
    effectiveFinalNodeId: graphResult.effectiveFinalNodeId,
    effectiveDnsNodeId: graphResult.effectiveDnsNodeId,
    targetNativeFinalOptions: graphResult.targetNativeFinalOptions,
    targetNativeRouteOptions: graphResult.targetNativeRouteOptions ?? [],
    targetNativeRuleSetSources: graphResult.targetNativeRuleSetSources ?? [],
    targetNativeSurgeGeneralNetwork: selectTargetNativeSurgeGeneralNetwork(g1Records, mihomoOutput?.id),
    targetNativeSurgeGeneralConnectivity: selectTargetNativeSurgeGeneralConnectivity(g2Records, mihomoOutput?.id),
    targetNativeSurgeGeneralProxyBypass: selectTargetNativeSurgeGeneralProxyBypass(g3cRecords, mihomoOutput?.id),
    targetNativeSurgeDnsBehavior: graphResult.targetNativeSurgeDnsBehavior,
  }), [g1Records, g2Records, g3cRecords, graphResult.effectiveDnsNodeId, graphResult.effectiveFinalNodeId, graphResult.nativeFinalRoute, graphResult.nativeRoutes, graphResult.nativeStrategies, graphResult.targetNativeFinalOptions, graphResult.targetNativeRouteOptions, graphResult.targetNativeRuleSetSources, mihomoOutput, targetSettings])
  const targetNativeOptions = useMemo(() => ({
    outputNodeId: surgeOutput?.id,
    targetSettings,
    targetNativeStrategies: graphResult.nativeStrategies ?? [],
    nativeRoutes: graphResult.nativeRoutes ?? [],
    nativeFinalRoute: graphResult.nativeFinalRoute,
    effectiveFinalNodeId: graphResult.effectiveFinalNodeId,
    effectiveDnsNodeId: graphResult.effectiveDnsNodeId,
    targetNativeFinalOptions: graphResult.targetNativeFinalOptions,
    targetNativeRouteOptions: graphResult.targetNativeRouteOptions ?? [],
    targetNativeRuleSetSources: graphResult.targetNativeRuleSetSources ?? [],
    targetNativeSurgeGeneralNetwork: selectTargetNativeSurgeGeneralNetwork(g1Records, surgeOutput?.id),
    targetNativeSurgeGeneralConnectivity: selectTargetNativeSurgeGeneralConnectivity(g2Records, surgeOutput?.id),
    targetNativeSurgeGeneralProxyBypass: selectTargetNativeSurgeGeneralProxyBypass(g3cRecords, surgeOutput?.id),
    targetNativeSurgeDnsBehavior: graphResult.targetNativeSurgeDnsBehavior,
  }), [g1Records, g2Records, g3cRecords, graphResult.effectiveDnsNodeId, graphResult.effectiveFinalNodeId, graphResult.nativeFinalRoute, graphResult.nativeRoutes, graphResult.nativeStrategies, graphResult.targetNativeFinalOptions, graphResult.targetNativeRouteOptions, graphResult.targetNativeRuleSetSources, surgeOutput, targetSettings])
  const singBoxOptions = useMemo(() => ({ ...targetNativeOptions, outputNodeId: singBoxOutput?.id, targetNativeSurgeGeneralNetwork: selectTargetNativeSurgeGeneralNetwork(g1Records, singBoxOutput?.id), targetNativeSurgeGeneralConnectivity: selectTargetNativeSurgeGeneralConnectivity(g2Records, singBoxOutput?.id), targetNativeSurgeGeneralProxyBypass: selectTargetNativeSurgeGeneralProxyBypass(g3cRecords, singBoxOutput?.id) }), [g1Records, g2Records, g3cRecords, singBoxOutput, targetNativeOptions])
  const loonOptions = useMemo(() => ({ ...targetNativeOptions, outputNodeId: loonOutput?.id, targetNativeSurgeGeneralNetwork: selectTargetNativeSurgeGeneralNetwork(g1Records, loonOutput?.id), targetNativeSurgeGeneralConnectivity: selectTargetNativeSurgeGeneralConnectivity(g2Records, loonOutput?.id), targetNativeSurgeGeneralProxyBypass: selectTargetNativeSurgeGeneralProxyBypass(g3cRecords, loonOutput?.id) }), [g1Records, g2Records, g3cRecords, loonOutput, targetNativeOptions])
  const shadowrocketOptions = useMemo(() => ({ ...targetNativeOptions, outputNodeId: shadowrocketOutput?.id, targetNativeSurgeGeneralNetwork: selectTargetNativeSurgeGeneralNetwork(g1Records, shadowrocketOutput?.id), targetNativeSurgeGeneralConnectivity: selectTargetNativeSurgeGeneralConnectivity(g2Records, shadowrocketOutput?.id), targetNativeSurgeGeneralProxyBypass: selectTargetNativeSurgeGeneralProxyBypass(g3cRecords, shadowrocketOutput?.id) }), [g1Records, g2Records, g3cRecords, shadowrocketOutput, targetNativeOptions])
  const compileEnabled = enabled && graphResult.success
  const mihomoState = useTargetCompile(graphResult.ir, 'mihomo', compileEnabled && resolvedSelection.mihomo, mihomoOptions)
  const surgeState = useTargetCompile(graphResult.ir, 'surge', compileEnabled && resolvedSelection.surge, targetNativeOptions)
  const singBoxState = useTargetCompile(graphResult.ir, 'sing-box', compileEnabled && resolvedSelection.singBox, singBoxOptions)
  const loonState = useTargetCompile(graphResult.ir, 'loon', compileEnabled && resolvedSelection.loon, loonOptions)
  const shadowrocketState = useTargetCompile(graphResult.ir, 'shadowrocket', compileEnabled && resolvedSelection.shadowrocket, shadowrocketOptions)
  return { graphResult, mihomoState, surgeState, singBoxState, loonState, shadowrocketState }
}

export type ProjectCompiles = ReturnType<typeof useProjectCompiles>

export interface PrimaryTargetHealth {
  status: 'checking' | 'ready' | 'blocked'
  diagnostics: StructuredDiagnostic[]
}

export function summarizePrimaryTargetHealth(compiles: ProjectCompiles, target: PrimaryTarget | null): PrimaryTargetHealth {
  if (target && getTargetCapabilities(target).productStatus === 'paused') return {
    status: 'blocked',
    diagnostics: [pausedTargetDiagnostic(target)],
  }
  const graphDiagnostics: StructuredDiagnostic[] = compiles.graphResult.issues
  if (!compiles.graphResult.success || !target) return {
    status: graphDiagnostics.some((issue) => issue.severity === 'error') ? 'blocked' : 'checking',
    diagnostics: graphDiagnostics,
  }

  const state = target === 'mihomo'
    ? compiles.mihomoState
    : target === 'surge' ? compiles.surgeState : target === 'sing-box' ? compiles.singBoxState : target === 'loon' ? compiles.loonState : compiles.shadowrocketState
  if (state.status === 'idle' || state.status === 'loading') return {
    status: getTargetCapabilities(target).productStatus === 'paused' ? 'blocked' : 'checking',
    diagnostics: getTargetCapabilities(target).productStatus === 'paused'
      ? [...graphDiagnostics, pausedTargetDiagnostic(target)]
      : graphDiagnostics,
  }

  const diagnostics = deduplicateDiagnostics<StructuredDiagnostic>([
    ...graphDiagnostics,
    ...(state.result?.issues ?? []),
  ])
  if ((state.status === 'error' || state.status === 'unavailable') && !diagnostics.some((issue) => issue.severity === 'error')) {
    diagnostics.push(targetCompilerUnavailableDiagnostic(state))
  }
  if (getTargetCapabilities(target).productStatus === 'paused') diagnostics.push(pausedTargetDiagnostic(target))
  return {
    status: getTargetCapabilities(target).productStatus === 'paused' || diagnostics.some((issue) => issue.severity === 'error') ? 'blocked' : 'ready',
    diagnostics: deduplicateDiagnostics(diagnostics),
  }
}

function pausedTargetDiagnostic(target: PrimaryTarget): StructuredDiagnostic {
  return {
    code: 'TARGET_PRODUCT_SUPPORT_PAUSED',
    severity: 'error',
    message: translateCurrent('compiler.targetPaused', { target: getTargetCapabilities(target).label }),
  }
}

function targetCompilerUnavailableDiagnostic(state: TargetCompileState): StructuredDiagnostic {
  return {
    code: 'TARGET_COMPILER_UNAVAILABLE',
    severity: 'error',
    message: state.status === 'unavailable' && state.error ? state.error : translateCurrent('compiler.loadFailed'),
  }
}

export function resolveMihomoProfileOutput(nodes: GraphNode[], _selectedNodeId?: string | null) {
  return nodes.find((node) => node.data.blockType === 'output' && node.data.client === 'mihomo' && !node.data.disabled)
    ?? nodes.find((node) => node.data.blockType === 'output' && node.data.mihomoProfile && !node.data.disabled)
}

/** Resolve the effective Output owner for a target without using another
 * target's profile or a target-native record's self-declared owner. */
export function resolveOutputForTarget(
  nodes: GraphNode[],
  target: PrimaryTarget,
  selectedNodeId?: string | null,
) {
  const candidates = nodes.filter((node) => node.data.blockType === 'output'
    && !node.data.disabled && node.data.client === target)
  if (selectedNodeId) {
    const selected = candidates.find((node) => node.id === selectedNodeId)
    if (selected) return selected
  }
  if (target === 'mihomo') {
    const profile = resolveMihomoProfileOutput(nodes, selectedNodeId)
    if (profile && candidates.includes(profile)) return profile
  }
  return candidates.length === 1 ? candidates[0] : undefined
}

/** Select the exact G1 record for a selected Output.  Kept exported for
 * Output Inspector and headless integrations that compile one Output at a
 * time.
 */
export function resolveTargetNativeSurgeGeneralNetworkForOutput(
  records: readonly TargetNativeSurgeGeneralNetworkIR[] | undefined,
  outputNodeId?: string | null,
) {
  return selectTargetNativeSurgeGeneralNetwork(records, outputNodeId ?? undefined)
}

export function resolveTargetNativeSurgeGeneralConnectivityForOutput(
  records: readonly import('../../core/targetNative').TargetNativeSurgeGeneralConnectivityIR[] | undefined,
  outputNodeId?: string | null,
) {
  return selectTargetNativeSurgeGeneralConnectivity(records, outputNodeId ?? undefined)
}

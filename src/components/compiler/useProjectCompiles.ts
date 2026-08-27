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
  const mihomoOptions = useMemo(() => ({
    outputNodeId: mihomoOutput?.id,
    targetProfile: mihomoOutput?.data.mihomoProfile,
    targetNativeStrategies: graphResult.nativeStrategies ?? [],
    nativeRoutes: graphResult.nativeRoutes ?? [],
    nativeFinalRoute: graphResult.nativeFinalRoute,
    targetNativeFinalOptions: graphResult.targetNativeFinalOptions,
    targetNativeRouteOptions: graphResult.targetNativeRouteOptions ?? [],
    targetNativeRuleSetSources: graphResult.targetNativeRuleSetSources ?? [],
  }), [graphResult.nativeFinalRoute, graphResult.nativeRoutes, graphResult.nativeStrategies, graphResult.targetNativeFinalOptions, graphResult.targetNativeRouteOptions, graphResult.targetNativeRuleSetSources, mihomoOutput])
  const targetNativeOptions = useMemo(() => ({
    targetNativeStrategies: graphResult.nativeStrategies ?? [],
    nativeRoutes: graphResult.nativeRoutes ?? [],
    nativeFinalRoute: graphResult.nativeFinalRoute,
    targetNativeFinalOptions: graphResult.targetNativeFinalOptions,
    targetNativeRouteOptions: graphResult.targetNativeRouteOptions ?? [],
    targetNativeRuleSetSources: graphResult.targetNativeRuleSetSources ?? [],
  }), [graphResult.nativeFinalRoute, graphResult.nativeRoutes, graphResult.nativeStrategies, graphResult.targetNativeFinalOptions, graphResult.targetNativeRouteOptions, graphResult.targetNativeRuleSetSources])
  const compileEnabled = enabled && graphResult.success
  const mihomoState = useTargetCompile(graphResult.ir, 'mihomo', compileEnabled && resolvedSelection.mihomo, mihomoOptions)
  const surgeState = useTargetCompile(graphResult.ir, 'surge', compileEnabled && resolvedSelection.surge, targetNativeOptions)
  const singBoxState = useTargetCompile(graphResult.ir, 'sing-box', compileEnabled && resolvedSelection.singBox, targetNativeOptions)
  const loonState = useTargetCompile(graphResult.ir, 'loon', compileEnabled && resolvedSelection.loon, targetNativeOptions)
  const shadowrocketState = useTargetCompile(graphResult.ir, 'shadowrocket', compileEnabled && resolvedSelection.shadowrocket, targetNativeOptions)
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

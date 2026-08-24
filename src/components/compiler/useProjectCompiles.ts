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
  validationTarget?: PrimaryTarget
}

export function resolveProjectCompileSelection(
  primaryTarget: PrimaryTarget | null,
  selection: ProjectCompileSelection = {},
) {
  const activeProductTarget = resolveActiveProductTarget(primaryTarget)
  const loonPrimary = primaryTarget === 'loon'
  return {
    activeProductTarget,
    mihomo: selection.mihomo ?? (!loonPrimary && activeProductTarget === 'mihomo'),
    surge: selection.surge ?? (!loonPrimary && activeProductTarget === 'surge'),
    singBox: selection.singBox ?? false,
    loon: selection.loon ?? primaryTarget === 'loon',
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
  const validationTarget = selection.validationTarget ?? (primaryTarget === 'loon' ? 'loon' : activeProductTarget)
  const graphResult = useMemo(() => compileGraph(toProject(), {
    subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale),
    validationTarget,
  }), [edges, locale, nodes, projectId, projectName, subscriptionSnapshots, toProject, validationTarget])
  const mihomoOutput = useMemo(() => resolveMihomoProfileOutput(nodes), [nodes])
  const mihomoOptions = useMemo(() => ({
    outputNodeId: mihomoOutput?.id,
    targetProfile: mihomoOutput?.data.mihomoProfile,
  }), [mihomoOutput])
  const compileEnabled = enabled && graphResult.success
  const mihomoState = useTargetCompile(graphResult.ir, 'mihomo', compileEnabled && resolvedSelection.mihomo, mihomoOptions)
  const surgeState = useTargetCompile(graphResult.ir, 'surge', compileEnabled && resolvedSelection.surge)
  const singBoxState = useTargetCompile(graphResult.ir, 'sing-box', compileEnabled && resolvedSelection.singBox)
  const loonState = useTargetCompile(graphResult.ir, 'loon', compileEnabled && resolvedSelection.loon)
  return { graphResult, mihomoState, surgeState, singBoxState, loonState }
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
    : target === 'surge' ? compiles.surgeState : target === 'sing-box' ? compiles.singBoxState : compiles.loonState
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
    status: diagnostics.some((issue) => issue.severity === 'error') ? 'blocked' : 'ready',
    diagnostics: deduplicateDiagnostics(diagnostics),
  }
}

function pausedTargetDiagnostic(target: PrimaryTarget): StructuredDiagnostic {
  return {
    code: 'TARGET_PRODUCT_SUPPORT_PAUSED',
    severity: 'error',
    message: `${getTargetCapabilities(target).label} official export is temporarily paused. Switch the Project to Mihomo to continue.`,
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

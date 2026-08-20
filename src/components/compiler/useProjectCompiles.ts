import { useMemo } from 'react'
import { compileGraph } from '../../core/graphCompiler'
import { deduplicateDiagnostics, type StructuredDiagnostic } from '../../core/compiler'
import { localizeSubscriptionSnapshots, translateCurrent, useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'
import type { PrimaryTarget } from '../../core/capabilities'
import { useTargetCompile, type TargetCompileState } from './useTargetCompile'

export interface ProjectCompileSelection {
  mihomo?: boolean
  singBox?: boolean
}

export function useProjectCompiles(enabled: boolean, selection: ProjectCompileSelection = {}) {
  const { locale } = useI18n()
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const graphResult = useMemo(() => compileGraph(toProject(), {
    subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale),
  }), [edges, locale, nodes, projectId, projectName, subscriptionSnapshots, toProject])
  const mihomoOutput = useMemo(() => resolveMihomoProfileOutput(nodes), [nodes])
  const mihomoOptions = useMemo(() => ({
    outputNodeId: mihomoOutput?.id,
    targetProfile: mihomoOutput?.data.mihomoProfile,
  }), [mihomoOutput])
  const compileEnabled = enabled && graphResult.success
  const mihomoState = useTargetCompile(graphResult.ir, 'mihomo', compileEnabled && selection.mihomo !== false, mihomoOptions)
  const singBoxState = useTargetCompile(graphResult.ir, 'sing-box', compileEnabled && selection.singBox !== false)
  return { graphResult, mihomoState, singBoxState }
}

export type ProjectCompiles = ReturnType<typeof useProjectCompiles>

export interface PrimaryTargetHealth {
  status: 'checking' | 'ready' | 'blocked'
  diagnostics: StructuredDiagnostic[]
}

export function summarizePrimaryTargetHealth(compiles: ProjectCompiles, target: PrimaryTarget | null): PrimaryTargetHealth {
  const graphDiagnostics: StructuredDiagnostic[] = compiles.graphResult.issues
  if (!compiles.graphResult.success || !target) return {
    status: graphDiagnostics.some((issue) => issue.severity === 'error') ? 'blocked' : 'checking',
    diagnostics: graphDiagnostics,
  }

  const state = target === 'mihomo' ? compiles.mihomoState : compiles.singBoxState
  if (state.status === 'idle' || state.status === 'loading') return {
    status: 'checking',
    diagnostics: graphDiagnostics,
  }

  const diagnostics = deduplicateDiagnostics<StructuredDiagnostic>([
    ...graphDiagnostics,
    ...(state.result?.issues ?? []),
  ])
  if ((state.status === 'error' || state.status === 'unavailable') && !diagnostics.some((issue) => issue.severity === 'error')) {
    diagnostics.push(targetCompilerUnavailableDiagnostic(state))
  }
  return {
    status: diagnostics.some((issue) => issue.severity === 'error') ? 'blocked' : 'ready',
    diagnostics,
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

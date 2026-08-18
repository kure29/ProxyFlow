import { useMemo } from 'react'
import { compileGraph } from '../../core/graphCompiler'
import { localizeSubscriptionSnapshots, useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'
import { useTargetCompile } from './useTargetCompile'

export function useProjectCompiles(enabled: boolean) {
  const { locale } = useI18n()
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const graphResult = useMemo(() => compileGraph(toProject(), {
    subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale),
  }), [edges, locale, nodes, projectId, projectName, subscriptionSnapshots, toProject])
  const mihomoOutput = useMemo(() => resolveMihomoProfileOutput(nodes, selectedNodeId), [nodes, selectedNodeId])
  const mihomoOptions = useMemo(() => ({
    outputNodeId: mihomoOutput?.id,
    targetProfile: mihomoOutput?.data.mihomoProfile,
  }), [mihomoOutput])
  const compileEnabled = enabled && graphResult.success
  const mihomoState = useTargetCompile(graphResult.ir, 'mihomo', compileEnabled, mihomoOptions)
  const singBoxState = useTargetCompile(graphResult.ir, 'sing-box', compileEnabled)
  return { graphResult, mihomoState, singBoxState }
}

export function resolveMihomoProfileOutput(nodes: GraphNode[], selectedNodeId: string | null) {
  const selected = nodes.find((node) => node.id === selectedNodeId)
  if (selected?.data.blockType === 'output' && selected.data.mihomoProfile && !selected.data.disabled) return selected
  return nodes.find((node) => node.data.blockType === 'output' && node.data.client === 'mihomo' && !node.data.disabled)
    ?? nodes.find((node) => node.data.blockType === 'output' && node.data.mihomoProfile && !node.data.disabled)
}

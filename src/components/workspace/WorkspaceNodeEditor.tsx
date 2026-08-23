import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Network, X } from 'lucide-react'
import { canUseWorkspaceInput, type WorkspaceSectionId } from '../../core/workspace'
import { categoryKey, localizeNodeTitle, useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'
import { Inspector } from '../inspector/Inspector'
import { resolveShellMode, type ShellMode } from '../layout/shellState'
import {
  NodeInputPicker,
  type NodeInputPickerCandidate,
  type NodeInputPickerMode,
} from './NodeInputPicker'
import { lockWorkspaceDocumentScroll } from './workspaceEditorLifecycle'
import {
  observeWorkspaceViewport,
  readWorkspaceViewportGeometry,
} from './workspaceEditorViewport'

interface WorkspaceNodeEditorProps {
  open: boolean
  onClose: () => void
  onShowFlow: () => void
  onOpenWorkspaceSection: (section: WorkspaceSectionId) => void
}

export function WorkspaceNodeEditor({ open, onClose, onShowFlow, onOpenWorkspaceSection }: WorkspaceNodeEditorProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const selected = nodes.find((node) => node.id === selectedNodeId)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [shellMode, setShellMode] = useState<ShellMode>(() => resolveShellMode(window.innerWidth))
  const [viewport, setViewport] = useState(() => readWorkspaceViewportGeometry(window))
  const modal = shellMode !== 'desktop'

  useEffect(() => {
    const updateMode = () => setShellMode(resolveShellMode(window.innerWidth))
    window.addEventListener('resize', updateMode)
    return () => window.removeEventListener('resize', updateMode)
  }, [])

  useEffect(() => {
    if (!open || !selected || !modal) return
    return observeWorkspaceViewport(window, setViewport)
  }, [modal, open, selected?.id])

  useEffect(() => {
    if (!open || !selected || !modal) return
    return lockWorkspaceDocumentScroll(window, document)
  }, [modal, open, selected?.id])

  useEffect(() => {
    if (!open || !selected) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target as Element | null)?.closest('.node-input-picker-panel, .region-picker-panel')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (!modal || event.key !== 'Tab') return
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [modal, onClose, open, selected?.id])

  if (!open || !selected) return null
  const title = localizeNodeTitle(selected, locale)
  const viewportStyle = modal ? {
    '--workspace-visual-viewport-height': `${viewport.height}px`,
    '--workspace-visual-viewport-offset-top': `${viewport.offsetTop}px`,
  } as CSSProperties : undefined

  const editor = <div
    className="workspace-editor-backdrop"
    data-shell-mode={shellMode}
    style={viewportStyle}
    role="presentation"
    onMouseDown={modal ? onClose : undefined}
  >
    <section
      ref={panelRef}
      className="workspace-editor-panel"
      role={modal ? 'dialog' : 'complementary'}
      aria-modal={modal ? true : undefined}
      aria-labelledby="workspace-editor-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="workspace-editor-toolbar">
        <div><span>{t('workspace.editor')}</span><strong id="workspace-editor-title">{title}</strong></div>
        <div><button type="button" onClick={onShowFlow}><Network size={15} /><span>{t('workspace.showInFlow')}</span></button><button ref={closeRef} type="button" aria-label={t('workspace.closeEditor')} onClick={onClose}><X size={18} /></button></div>
      </header>
      <div className="workspace-editor-scroll-content">
        <WorkspaceInputEditor node={selected} />
        <Inspector onOpenWorkspaceSection={onOpenWorkspaceSection} />
      </div>
    </section>
  </div>

  return shouldPortalWorkspaceEditor(shellMode) ? createPortal(editor, document.body) : editor
}

export function shouldPortalWorkspaceEditor(shellMode: ShellMode): boolean {
  return shellMode !== 'desktop'
}

export function resolveWorkspaceInputMode(node: GraphNode): NodeInputPickerMode | null {
  if (node.data.category === 'strategy' || node.data.blockType === 'merge') return 'multiple'
  if (node.data.category === 'processing') return 'single'
  return null
}

export interface WorkspaceInputCandidateState {
  node: GraphNode
  disabled: boolean
  unavailable: boolean
}

export function resolveWorkspaceInputCandidates(
  nodes: GraphNode[],
  edges: Parameters<typeof canUseWorkspaceInput>[1],
  nodeId: string,
  selectedIds: readonly string[],
): WorkspaceInputCandidateState[] {
  return nodes
    .filter((candidate) => candidate.id !== nodeId && (
      selectedIds.includes(candidate.id) || ['source', 'processing'].includes(candidate.data.category)
    ))
    .map((candidate) => {
      const selected = selectedIds.includes(candidate.id)
      const available = canUseWorkspaceInput(nodes, edges, nodeId, candidate.id)
      return {
        node: candidate,
        disabled: !available,
        unavailable: selected && !available,
      }
    })
}

function WorkspaceInputEditor({ node }: { node: GraphNode }) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const setInputs = useBuilderStore((state) => state.setWorkspaceInputs)
  const mode = resolveWorkspaceInputMode(node)
  const selectedIds = useMemo(() => [...new Set(edges
    .filter((edge) => edge.target === node.id && ['data', 'strategy'].includes(String(edge.data?.semantic)))
    .map((edge) => edge.source))], [edges, node.id])
  const candidates = useMemo(() => (
    resolveWorkspaceInputCandidates(nodes, edges, node.id, selectedIds)
  ), [edges, node.id, nodes, selectedIds])

  if (!mode) return null
  const multiple = mode === 'multiple'
  const selectedCandidate = candidates.find((candidate) => candidate.node.id === selectedIds[0])
  const pickerCandidates: NodeInputPickerCandidate[] = [
    ...(multiple ? [] : [{ id: '', label: t('workspace.inputNone') }]),
    ...candidates.map((candidate) => ({
      id: candidate.node.id,
      label: localizeNodeTitle(candidate.node, locale),
      meta: t(categoryKey(candidate.node.data.category)),
      disabled: candidate.disabled,
      unavailable: candidate.unavailable,
    })),
  ]
  const summary = multiple
    ? t('workspace.inputSelectedCount', { count: selectedIds.length })
    : selectedCandidate
      ? localizeNodeTitle(selectedCandidate.node, locale)
      : t('workspace.inputNone')

  return <section className="workspace-input-editor" aria-labelledby="workspace-input-title">
    <div><strong id="workspace-input-title">{t('workspace.inputSource')}</strong><small>{t('workspace.inputHint')}</small></div>
    {candidates.length === 0
      ? <span>{t('workspace.noInputCandidates')}</span>
      : <NodeInputPicker
          mode={mode}
          selectedIds={selectedIds}
          candidates={pickerCandidates}
          label={t('workspace.inputPickerTitle')}
          summary={summary}
          searchPlaceholder={t('workspace.inputSearch')}
          emptyMessage={t('workspace.noInputCandidates')}
          cancelLabel={t('workspace.cancel')}
          doneLabel={(count) => t('workspace.inputDone', { count })}
          closeLabel={t('workspace.closeEditor')}
          unavailableLabel={t('workspace.inputUnavailable')}
          onChange={(ids) => setInputs(node.id, mode === 'single' ? ids.slice(0, 1) : ids)}
        />}
  </section>
}

import { useEffect, useMemo, useRef } from 'react'
import { Network, X } from 'lucide-react'
import { canUseWorkspaceInput } from '../../core/workspace'
import { localizeNodeTitle, useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'
import { Inspector } from '../inspector/Inspector'

interface WorkspaceNodeEditorProps {
  open: boolean
  onClose: () => void
  onShowFlow: () => void
}

export function WorkspaceNodeEditor({ open, onClose, onShowFlow }: WorkspaceNodeEditorProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const selected = nodes.find((node) => node.id === selectedNodeId)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || !selected) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
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
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, selected?.id])

  if (!open || !selected) return null
  const title = localizeNodeTitle(selected, locale)

  return <div className="workspace-editor-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={panelRef} className="workspace-editor-panel" role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="workspace-editor-toolbar">
        <div><span>{t('workspace.editor')}</span><strong id="workspace-editor-title">{title}</strong></div>
        <div><button type="button" onClick={onShowFlow}><Network size={15} /><span>{t('workspace.showInFlow')}</span></button><button ref={closeRef} type="button" aria-label={t('workspace.closeEditor')} onClick={onClose}><X size={18} /></button></div>
      </header>
      <WorkspaceInputEditor node={selected} />
      <Inspector />
    </section>
  </div>
}

function WorkspaceInputEditor({ node }: { node: GraphNode }) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const setInputs = useBuilderStore((state) => state.setWorkspaceInputs)
  const editable = node.data.category === 'processing' || node.data.category === 'strategy'
  const selectedIds = useMemo(() => edges
    .filter((edge) => edge.target === node.id && ['data', 'strategy'].includes(String(edge.data?.semantic)))
    .map((edge) => edge.source), [edges, node.id])
  const candidates = useMemo(() => nodes.filter((candidate) => candidate.id !== node.id && (
    selectedIds.includes(candidate.id) || canUseWorkspaceInput(nodes, edges, node.id, candidate.id)
  )), [edges, node.id, nodes, selectedIds])
  const multiple = node.data.category === 'strategy' || node.data.blockType === 'merge'

  if (!editable) return null
  return <section className="workspace-input-editor" aria-labelledby="workspace-input-title">
    <div><strong id="workspace-input-title">{t(multiple ? 'workspace.inputSources' : 'workspace.inputSource')}</strong><small>{t('workspace.inputHint')}</small></div>
    {candidates.length === 0
      ? <span>{t('workspace.noInputCandidates')}</span>
      : multiple
        ? <div className="workspace-input-options">{candidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={selectedIds.includes(candidate.id)} onChange={(event) => setInputs(node.id, event.target.checked ? [...selectedIds, candidate.id] : selectedIds.filter((id) => id !== candidate.id))} /><span>{localizeNodeTitle(candidate, locale)}</span></label>)}</div>
        : <select aria-label={t('workspace.inputSource')} value={selectedIds[0] ?? ''} onChange={(event) => setInputs(node.id, event.target.value ? [event.target.value] : [])}><option value="">{t('workspace.inputNone')}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{localizeNodeTitle(candidate, locale)}</option>)}</select>}
  </section>
}

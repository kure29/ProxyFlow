import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Focus, LayoutTemplate, Redo2, Undo2 } from 'lucide-react'
import { ProxyFlowCanvas } from '../canvas/ProxyFlowCanvas'
import { Inspector } from '../inspector/Inspector'
import { BlockLibrary } from '../layout/BlockLibrary'
import { ResizableWorkspace } from '../layout/ResizableWorkspace'
import { useBuilderStore } from '../../store/useBuilderStore'
import { useI18n } from '../../i18n'
import { IconButton } from '../ui/Primitives'
import type { WorkspaceSectionId } from '../../core/workspace'

export default function VisualFlowWorkspace({ onOpenWorkspaceSection }: { onOpenWorkspaceSection: (section: WorkspaceSectionId) => void }) {
  const { fitView } = useReactFlow()
  const { t } = useI18n()
  const undo = useBuilderStore((state) => state.undo)
  const redo = useBuilderStore((state) => state.redo)
  const autoLayout = useBuilderStore((state) => state.autoLayout)
  const canUndo = useBuilderStore((state) => state.historyPast.length > 0)
  const canRedo = useBuilderStore((state) => state.historyFuture.length > 0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement
      const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable
      if (isEditing || event.key.toLowerCase() !== 'f') return
      event.preventDefault()
      fitView({ padding: 0.15, duration: 400 })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fitView])

  return <ResizableWorkspace
    library={<BlockLibrary />}
    canvas={<div id="canvas" className="canvas-region"><ProxyFlowCanvas /><nav className="visual-flow-mobile-toolbar" aria-label={t('top.canvasActions')}>
      <IconButton label={t('top.undo')} disabled={!canUndo} onClick={undo}><Undo2 size={17} /></IconButton>
      <IconButton label={t('top.redo')} disabled={!canRedo} onClick={redo}><Redo2 size={17} /></IconButton>
      <IconButton label={t('top.autoLayout')} onClick={() => { autoLayout(); window.setTimeout(() => fitView({ padding: 0.15, duration: 180 }), 40) }}><LayoutTemplate size={17} /></IconButton>
      <IconButton label={t('status.fit')} onClick={() => fitView({ padding: 0.15, duration: 180 })}><Focus size={17} /></IconButton>
    </nav></div>}
    inspector={<Inspector onOpenWorkspaceSection={onOpenWorkspaceSection} />}
  />
}

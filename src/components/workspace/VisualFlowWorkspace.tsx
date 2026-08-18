import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ProxyFlowCanvas } from '../canvas/ProxyFlowCanvas'
import { Inspector } from '../inspector/Inspector'
import { BlockLibrary } from '../layout/BlockLibrary'
import { ResizableWorkspace } from '../layout/ResizableWorkspace'

export default function VisualFlowWorkspace() {
  const { fitView } = useReactFlow()

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
    canvas={<div id="canvas" className="canvas-region"><ProxyFlowCanvas /></div>}
    inspector={<Inspector />}
  />
}

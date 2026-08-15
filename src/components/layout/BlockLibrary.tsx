import { useMemo, useState } from 'react'
import { ChevronDown, GripVertical, Search, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { blockLibrary } from '../../data/blockLibrary'
import { useBuilderStore } from '../../store/useBuilderStore'
import { BlockIcon } from '../icons/BlockIcon'
import type { BlockType } from '../../types/project'

export function BlockLibrary() {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const addNode = useBuilderStore((state) => state.addNode)
  const { screenToFlowPosition } = useReactFlow()
  const groups = useMemo(() => blockLibrary.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.title}${item.description}`.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => group.items.length > 0), [query])

  const addAtCenter = (type: BlockType) => {
    const position = screenToFlowPosition({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.5 })
    addNode(type, position)
  }

  return (
    <aside className="block-library" aria-label="配置模块库">
      <div className="panel-heading">
        <div><span>BLOCKS</span><h2>模块库</h2></div>
        <kbd>B</kbd>
      </div>
      <div className="library-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模块" aria-label="搜索模块" />
        {query && <button onClick={() => setQuery('')} aria-label="清空搜索"><X size={13} /></button>}
      </div>
      <div className="library-scroll">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.category)
          return (
            <section className="library-group" key={group.category}>
              <button className="library-group-title" onClick={() => setCollapsed((current) => {
                const next = new Set(current)
                next.has(group.category) ? next.delete(group.category) : next.add(group.category)
                return next
              })} aria-expanded={!isCollapsed}>
                <span className={`category-dot category-dot--${group.category}`} />
                {group.label}<small>{group.items.length}</small><ChevronDown size={13} className={isCollapsed ? 'is-rotated' : ''} />
              </button>
              {!isCollapsed && <div className="library-items">
                {group.items.map((item) => (
                  <button
                    className={`library-item library-item--${item.category}`}
                    key={item.type}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/proxyflow', item.type)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => addAtCenter(item.type)}
                  >
                    <span className="library-item-icon"><BlockIcon name={item.icon} /></span>
                    <span><strong>{item.title}</strong><small>{item.description}</small></span>
                    <GripVertical className="library-grip" size={14} />
                  </button>
                ))}
              </div>}
            </section>
          )
        })}
        {groups.length === 0 && <div className="library-empty">没有匹配的模块</div>}
      </div>
      <div className="library-tip"><span>TIP</span> 单击添加，或拖到画布</div>
    </aside>
  )
}

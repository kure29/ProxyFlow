import { useMemo, useState } from 'react'
import { ChevronDown, GripVertical, Search, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { blockLibrary } from '../../data/blockLibrary'
import { useBuilderStore } from '../../store/useBuilderStore'
import { BlockIcon } from '../icons/BlockIcon'
import type { BlockType } from '../../types/project'
import { blockDescriptionKey, blockTitleKey, categoryKey, useI18n } from '../../i18n'

export function BlockLibrary() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const addLibraryNode = useBuilderStore((state) => state.addLibraryNode)
  const { screenToFlowPosition } = useReactFlow()
  const groups = useMemo(() => blockLibrary.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${t(item.titleKey ?? blockTitleKey(item.type))}${t(item.descriptionKey ?? blockDescriptionKey(item.type))}`.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => group.items.length > 0), [query, t])

  const addAtCenter = (type: BlockType) => {
    const position = screenToFlowPosition({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.5 })
    addLibraryNode(type, position)
  }

  return (
    <aside className="block-library" aria-label={t('library.aria')}>
      <div className="panel-heading">
        <div><span>{t('library.label')}</span><h2>{t('library.title')}</h2></div>
      </div>
      <div className="library-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('library.search')} aria-label={t('library.search')} />
        {query && <button onClick={() => setQuery('')} aria-label={t('library.clearSearch')}><X size={13} /></button>}
      </div>
      <div className="library-scroll">
        {groups.map((group) => {
          const groupId = `${group.category}:${group.label}`
          const isCollapsed = collapsed.has(groupId)
          return (
            <section className="library-group" key={groupId}>
              <button className="library-group-title" onClick={() => setCollapsed((current) => {
                const next = new Set(current)
                next.has(groupId) ? next.delete(groupId) : next.add(groupId)
                return next
              })} aria-expanded={!isCollapsed}>
                <span className={`category-dot category-dot--${group.category}`} />
                {group.advanced ? (group.category === 'strategy' ? t('category.strategyAdvanced') : `${t('category.advanced')} · ${t(categoryKey(group.category))}`) : t(categoryKey(group.category))}<small>{group.items.length}</small><ChevronDown size={13} className={isCollapsed ? 'is-rotated' : ''} />
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
                    <span><strong>{t(item.titleKey ?? blockTitleKey(item.type))}</strong><small>{t(item.descriptionKey ?? blockDescriptionKey(item.type))}</small></span>
                    <GripVertical className="library-grip" size={14} />
                  </button>
                ))}
              </div>}
            </section>
          )
        })}
        {groups.length === 0 && <div className="library-empty">{t('library.empty')}</div>}
      </div>
      <div className="library-tip"><span>{t('library.tipLabel')}</span> {t('library.tip')}</div>
    </aside>
  )
}

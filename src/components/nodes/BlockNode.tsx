import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, ArrowRight, Check, GripVertical, MoreHorizontal, Zap } from 'lucide-react'
import { BlockIcon } from '../icons/BlockIcon'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'
import { categoryKey, localizeDataValue, localizeKnownSystemText, useI18n } from '../../i18n'
import { detectRegion } from '../../core/proxy'

const noInput = new Set(['subscription', 'manual-proxy', 'provider', 'import-config', 'routing-group', 'service-rule', 'custom-rule', 'final'])
const noOutput = new Set(['output'])

export function BlockNode({ id, data, selected, isConnectable }: NodeProps<GraphNode>) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const hopNodes = (data.hopIds ?? []).map((hopId) => nodes.find((node) => node.id === hopId)).filter(Boolean)

  return (
    <article
      className={`flow-node flow-node--${data.category}${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}${data.highlighted ? ' is-highlighted' : ''}${data.disabled ? ' is-disabled' : ''}`}
      aria-label={t('node.aria', { name: localizeDataValue(data.title, data.titleKey, locale) })}
    >
      {!noInput.has(data.blockType) && (
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="flow-handle flow-handle--input" />
      )}

      <div className="node-accent" />
      <header className="node-header">
        <div className="node-icon"><BlockIcon name={data.icon} size={17} /></div>
        <div className="node-heading">
          <strong>{localizeDataValue(data.title, data.titleKey, locale)}</strong>
          <span>{data.category === 'chain' ? t('node.proxyChain') : t(categoryKey(data.category))}</span>
        </div>
        {data.warning ? <AlertTriangle className="node-warning" size={15} /> : <MoreHorizontal className="node-more" size={17} />}
      </header>

      <div className="node-content">
        {data.blockType === 'subscription' && (
          <div className="node-metric-row">
            <span className={`status-dot-label status-${data.runtimeStatus ?? 'unavailable'}`}><i /> {runtimeStatusLabel(data.runtimeStatus, t)}</span>
            <strong>{data.runtimeOutputCount ?? data.nodeCount ?? 0}<small> {t('node.count', { count: '' }).trim()}</small></strong>
          </div>
        )}

        {data.blockType === 'filter' && (
          <><FilterSummary nodeId={id} data={data} /><RuntimeCount data={data} /></>
        )}

        {['rename', 'sort', 'deduplicate', 'merge', 'limit'].includes(data.blockType) && <RuntimeCount data={data} />}

        {['auto-select', 'manual-select', 'fallback', 'load-balance', 'fixed-proxy'].includes(data.blockType) && (
          <div className="node-strategy-row"><Zap size={13} /><span>{t('node.candidates', { count: data.runtimeOutputCount ?? 0 })}</span></div>
        )}

        {data.blockType === 'proxy-chain' && (
          <div className="node-chain">
            {hopNodes.length > 0 ? hopNodes.map((hop, index) => (
              <div className="node-chain-hop" key={hop!.id}>
                <span>{index + 1}</span><b>{localizeDataValue(hop!.data.title, hop!.data.titleKey, locale)}</b>
                {index < hopNodes.length - 1 && <ArrowRight size={13} />}
              </div>
            )) : <span className="node-empty-inline">{t('node.chainEmpty')}</span>}
          </div>
        )}

        {['routing-group', 'service-rule'].includes(data.blockType) && (
          <div className="node-services">
            {(data.services ?? []).map((service) => (
              <button key={service} onClick={(event) => { event.stopPropagation(); selectNode(id, service) }}>{localizeKnownSystemText(service, locale)}</button>
            ))}
          </div>
        )}

        {data.blockType === 'dns' && (
          <div className="node-dns-row"><span>DoH</span><code>1.1.1.1</code></div>
        )}

        {data.blockType === 'final' && (
          <div className="node-target-row"><span>{t('node.allOtherTraffic')}</span><ArrowRight size={13} /><b>{t('node.defaultProxy')}</b></div>
        )}

        {data.blockType === 'output' && (
          <div className="node-output-row"><span><Check size={12} /> {compatibilityLabel(data.compatibility, t)}</span><b>{String(data.client ?? '').toUpperCase()}</b></div>
        )}

        {!['subscription', 'filter', 'rename', 'sort', 'deduplicate', 'merge', 'limit', 'auto-select', 'manual-select', 'fallback', 'load-balance', 'fixed-proxy', 'proxy-chain', 'routing-group', 'service-rule', 'dns', 'final', 'output'].includes(data.blockType) && (
          <p className="node-default-copy">{localizeDataValue(data.subtitle, data.subtitleKey, locale)}</p>
        )}
      </div>

      <footer className="node-footer">
        <span>{localizeDataValue(data.subtitle, data.subtitleKey, locale)}</span>
        <GripVertical size={13} />
      </footer>

      {!noOutput.has(data.blockType) && (
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="flow-handle flow-handle--output" />
      )}
    </article>
  )
}

function FilterSummary({ nodeId, data }: { nodeId: string; data: GraphNode['data'] }) {
  const { t } = useI18n()
  const operation = data.filterOperation === 'exclude' ? 'exclude' : 'include'
  if (data.filterMode === 'region') return <div className="node-chip-row">
    {(data.filterRegions ?? []).slice(0, 2).map((region) => <span key={region}>{region === 'UK' ? 'GB' : region}</span>)}
    <em>{t(`inspector.filterOperation.${operation}`)}</em>
  </div>
  if (data.filterMode === 'regex') return <div className="node-chip-row">
    <span>/{data.filterRegexPattern || '…'}/{data.filterRegexIgnoreCase ?? true ? 'i' : ''}</span>
    <em>{t(`inspector.filterOperation.${operation}`)}</em>
  </div>
  if (data.filterMode === 'keyword') return <div className="node-chip-row">
    <span>{data.filterKeyword?.trim() || '…'}</span>
    <em>{t(`inspector.filterOperation.${operation}`)}</em>
  </div>
  const isLegacyDemoFilter = nodeId === 'hk-filter' || nodeId === 'us-filter'
  const legacyRegions = [...new Set((data.includeRegions ?? []).map(displayLegacyRegion))]
  const legacyWords = [...new Set((data.include ?? []).map((word) => isLegacyDemoFilter ? displayLegacyRegion(word) : word))]
  return <div className="node-chip-row">
    {legacyRegions.slice(0, 2).map((region) => <span key={region}>{region}</span>)}
    {legacyWords.filter((word) => !legacyRegions.includes(word) && !isDuplicateLegacyRegion(word, data.includeRegions ?? [])).slice(0, 2).map((word) => <span key={word}>{word}</span>)}
  </div>
}

function displayLegacyRegion(value: string) {
  const normalized = value.normalize('NFKC').trim()
  if (normalized === 'UK') return 'GB'
  const legacyAliases: Record<string, string> = { '香港': 'HK', '日本': 'JP', '新加坡': 'SG', '美国': 'US', '美國': 'US', '中国': 'CN', '中國': 'CN' }
  if (legacyAliases[normalized]) return legacyAliases[normalized]
  const detected = detectRegion(normalized).code
  return detected === 'UNKNOWN' ? normalized : detected
}

function isDuplicateLegacyRegion(value: string, regions: NonNullable<GraphNode['data']['includeRegions']>) {
  const detected = detectRegion(value).code
  return detected !== 'UNKNOWN' && regions.some((region) => displayLegacyRegion(region) === detected)
}

function RuntimeCount({ data }: { data: GraphNode['data'] }) {
  const { t } = useI18n()
  if (data.runtimeStatus === 'error') return <div className="node-runtime-count is-error"><strong>{t('node.upstreamError')}</strong><small>{t('node.processingBlocked')}</small></div>
  return <div className="node-runtime-count"><strong>{data.runtimeInputCount ?? 0} → {data.runtimeOutputCount ?? 0}</strong><small>{t('node.removed', { count: data.runtimeRemovedCount ?? 0 })}</small></div>
}

function runtimeStatusLabel(status: GraphNode['data']['runtimeStatus'], t: ReturnType<typeof useI18n>['t']) {
  if (status === 'ready') return t('node.status.ready')
  if (status === 'stale') return t('node.status.stale')
  if (status === 'error') return t('node.status.error')
  return t('node.status.unavailable')
}

function compatibilityLabel(value: unknown, t: ReturnType<typeof useI18n>['t']) {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'supported') return t('node.compatibility.supported')
  if (normalized === 'prototype') return t('node.compatibility.prototype')
  if (normalized === 'compiled') return t('node.compatibility.compiled')
  return localizeKnownSystemText(String(value ?? ''), 'en-US')
}

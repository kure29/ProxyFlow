import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, ArrowRight, Check, GripVertical, MoreHorizontal, Zap } from 'lucide-react'
import { BlockIcon } from '../icons/BlockIcon'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { GraphNode } from '../../types/project'

const noInput = new Set(['subscription', 'manual-proxy', 'provider', 'import-config', 'routing-group', 'service-rule', 'custom-rule', 'final'])
const noOutput = new Set(['output'])

export function BlockNode({ id, data, selected, isConnectable }: NodeProps<GraphNode>) {
  const nodes = useBuilderStore((state) => state.nodes)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const hopNodes = (data.hopIds ?? []).map((hopId) => nodes.find((node) => node.id === hopId)).filter(Boolean)

  return (
    <article
      className={`flow-node flow-node--${data.category}${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}${data.highlighted ? ' is-highlighted' : ''}${data.disabled ? ' is-disabled' : ''}`}
      aria-label={`${data.title} 节点`}
    >
      {!noInput.has(data.blockType) && (
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="flow-handle flow-handle--input" />
      )}

      <div className="node-accent" />
      <header className="node-header">
        <div className="node-icon"><BlockIcon name={data.icon} size={17} /></div>
        <div className="node-heading">
          <strong>{data.title}</strong>
          <span>{data.category === 'chain' ? 'PROXY CHAIN' : data.category.toUpperCase()}</span>
        </div>
        {data.warning ? <AlertTriangle className="node-warning" size={15} /> : <MoreHorizontal className="node-more" size={17} />}
      </header>

      <div className="node-content">
        {data.blockType === 'subscription' && (
          <div className="node-metric-row">
            <span className="status-dot-label"><i /> 已同步</span>
            <strong>{data.nodeCount ?? 0}<small> 节点</small></strong>
          </div>
        )}

        {data.blockType === 'filter' && (
          <div className="node-chip-row">
            {(data.include ?? []).slice(0, 2).map((word) => <span key={word}>{word}</span>)}
            <em>{(data.exclude ?? []).length} 排除</em>
          </div>
        )}

        {['auto-select', 'manual-select', 'fallback', 'load-balance', 'fixed-proxy'].includes(data.blockType) && (
          <div className="node-strategy-row"><Zap size={13} /><span>{data.subtitle}</span></div>
        )}

        {data.blockType === 'proxy-chain' && (
          <div className="node-chain">
            {hopNodes.length > 0 ? hopNodes.map((hop, index) => (
              <div className="node-chain-hop" key={hop!.id}>
                <span>{index + 1}</span><b>{hop!.data.title.replace('自动选择', '')}</b>
                {index < hopNodes.length - 1 && <ArrowRight size={13} />}
              </div>
            )) : <span className="node-empty-inline">尚未添加链路</span>}
          </div>
        )}

        {['routing-group', 'service-rule'].includes(data.blockType) && (
          <div className="node-services">
            {(data.services ?? []).map((service) => (
              <button key={service} onClick={(event) => { event.stopPropagation(); selectNode(id, service) }}>{service}</button>
            ))}
          </div>
        )}

        {data.blockType === 'dns' && (
          <div className="node-dns-row"><span>DoH</span><code>1.1.1.1</code></div>
        )}

        {data.blockType === 'final' && (
          <div className="node-target-row"><span>所有其余流量</span><ArrowRight size={13} /><b>默认代理</b></div>
        )}

        {data.blockType === 'output' && (
          <div className="node-output-row"><span><Check size={12} /> {data.compatibility}</span><b>{String(data.client ?? '').toUpperCase()}</b></div>
        )}

        {!['subscription', 'filter', 'auto-select', 'manual-select', 'fallback', 'load-balance', 'fixed-proxy', 'proxy-chain', 'routing-group', 'service-rule', 'dns', 'final', 'output'].includes(data.blockType) && (
          <p className="node-default-copy">{data.subtitle}</p>
        )}
      </div>

      <footer className="node-footer">
        <span>{data.subtitle}</span>
        <GripVertical size={13} />
      </footer>

      {!noOutput.has(data.blockType) && (
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="flow-handle flow-handle--output" />
      )}
    </article>
  )
}

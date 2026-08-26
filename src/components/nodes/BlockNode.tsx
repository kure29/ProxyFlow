import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, ArrowRight, Check, GripVertical, MoreHorizontal, Zap } from 'lucide-react'
import { BlockIcon } from '../icons/BlockIcon'
import { ServiceMark } from '../services/ServiceMark'
import { resolveServiceMarkId } from '../services/serviceMarkDefinitions'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { BlockNodeData, GraphNode } from '../../types/project'
import { isTargetNativeStrategyConfig, type PolicyReference, type SurgeSubnetMatcher } from '../../core/targetNative'
import {
  categoryKey, localizeDataValue, localizeDiagnosticMessage, localizeKnownSystemText, localizeNodeTitle, useI18n,
  type Locale,
} from '../../i18n'
import { detectRegion } from '../../core/proxy'
import { snapshotFreshness } from '../../core/subscription'
import { resolveRouteMatcherKind } from '../../core/routing/routeProductModel'
import { normalizeDnsResolvers } from '../../core/dns/resolverProfiles'

const noInput = new Set(['subscription', 'manual-proxy', 'provider', 'import-config', 'routing-group', 'service-rule', 'custom-rule', 'final', 'target-native-strategy'])
const noOutput = new Set(['output'])

export function BlockNode({ id, data, selected, isConnectable }: NodeProps<GraphNode>) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const subscriptionRuntime = useBuilderStore((state) => state.subscriptionRuntimes[id])
  const selectNode = useBuilderStore((state) => state.selectNode)
  const activeService = useBuilderStore((state) => state.activeService)
  const hopNodes = (data.hopIds ?? []).map((hopId) => nodes.find((node) => node.id === hopId)).filter(Boolean)
  const subscriptionStatus = data.blockType === 'subscription' ? subscriptionNodeStatus(subscriptionRuntime) : undefined
  const subscriptionTooltip = subscriptionRuntime?.latestError
    ? localizeDiagnosticMessage(subscriptionRuntime.latestError.code, subscriptionRuntime.latestError.message, locale)
    : undefined
  const dnsSummary = data.blockType === 'dns' ? summarizeDnsNode(data) : undefined
  const finalTarget = data.blockType === 'final'
    ? resolveFinalTargetSummary(data, nodes, locale, t('inspector.notConfigured'))
    : undefined

  return (
    <article
      className={`flow-node flow-node--${data.category}${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}${data.highlighted ? ' is-highlighted' : ''}${data.disabled ? ' is-disabled' : ''}${data.warning ? ' has-warning' : ''}`}
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
            <span className={`status-dot-label status-${subscriptionStatus ?? data.runtimeStatus ?? 'unavailable'}`} title={subscriptionTooltip}><i /> {subscriptionStatusLabel(subscriptionRuntime, t)}</span>
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

        {data.blockType === 'target-native-strategy' && <TargetNativeSummary data={data} nodes={nodes} t={t} />}

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

        {resolveRouteMatcherKind(data) === 'service' && (
          <div className="node-services">
            {(data.services ?? []).map((service) => {
              const markId = resolveServiceMarkId(service)
              const isActive = activeService === service || activeService === markId
              return <button key={service} onClick={(event) => { event.stopPropagation(); selectNode(id, service) }}>
                {markId && <ServiceMark serviceId={markId} size="small" selected={isActive} />}
                <span>{localizeKnownSystemText(service, locale)}</span>
              </button>
            })}
          </div>
        )}

        {resolveRouteMatcherKind(data) && resolveRouteMatcherKind(data) !== 'service' && (
          <div className="node-chip-row"><span>{resolveRouteMatcherKind(data)}</span><em>{data.routeMatcherKind === 'port' ? data.routeMatcherPort ?? '…' : data.routeMatcherValue || '…'}</em></div>
        )}

        {data.blockType === 'dns' && (
          <div className="node-dns-row">
            <span>{dnsSummary?.protocol ?? '—'}</span>
            <code title={dnsSummary?.detail}>{dnsSummary ? `${dnsSummary.detail}${dnsSummary.additionalCount > 0 ? ` +${dnsSummary.additionalCount}` : ''}` : t('node.noEnabledResolvers')}</code>
          </div>
        )}

        {data.blockType === 'final' && (
          <div className="node-target-row"><span>{t('node.allOtherTraffic')}</span><ArrowRight size={13} /><b title={finalTarget}>{finalTarget}</b></div>
        )}

        {data.blockType === 'output' && (
          <div className="node-output-row"><span><Check size={12} /> {compatibilityLabel(data.compatibility, t)}</span><b>{String(data.client ?? '').toUpperCase()}</b></div>
        )}

        {!['subscription', 'filter', 'rename', 'sort', 'deduplicate', 'merge', 'limit', 'auto-select', 'manual-select', 'fallback', 'load-balance', 'fixed-proxy', 'target-native-strategy', 'proxy-chain', 'routing-group', 'service-rule', 'custom-rule', 'dns', 'final', 'output'].includes(data.blockType) && (
          <p className="node-default-copy">{localizeDataValue(data.subtitle, data.subtitleKey, locale)}</p>
        )}
      </div>

      <footer className="node-footer">
        <span>{data.blockType === 'final'
          ? `${t('workspace.routing.finalRoute')} · ${finalTarget}`
          : localizeDataValue(data.subtitle, data.subtitleKey, locale)}</span>
        <GripVertical size={13} />
      </footer>

      {!noOutput.has(data.blockType) && (
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="flow-handle flow-handle--output" />
      )}
    </article>
  )
}

function TargetNativeSummary({ data, nodes, t }: { data: BlockNodeData; nodes: GraphNode[]; t: ReturnType<typeof useI18n>['t'] }) {
  const native = data.targetNativeStrategy
  if (!isTargetNativeStrategyConfig(native)) return <span className="node-empty-inline">⚠ {t('inspector.targetNativeInvalid')}</span>
  if (native.kind === 'smart') return <div className="node-native-summary"><span>{t('inspector.targetNativeSmart')} <em className="node-native-badge">{t('inspector.targetNativeBadge')}</em></span><b>{t('workspace.strategy.summary.smart', { count: native.members.length })}</b></div>
  const conditionCount = native.conditions.length
  const defaultLabel = policyReferenceLabel(native.defaultPolicy, nodes)
  const first = native.conditions.find((condition) => Boolean(condition?.matcher))
  return <div className="node-native-summary"><span>{t('inspector.targetNativeSubnet')} <em className="node-native-badge">{t('inspector.targetNativeBadge')}</em></span>{first && <b>{nativeMatcherLabel(first.matcher)} → {policyReferenceLabel(first.policy, nodes)}</b>}<small>{t('workspace.strategy.summary.subnet', { count: conditionCount, default: defaultLabel })}</small></div>
}

function nativeMatcherLabel(matcher: SurgeSubnetMatcher) {
  return matcher.kind === 'network-type' ? `TYPE:${matcher.value}` : `${matcher.kind.toUpperCase()}:${matcher.value}`
}

function policyReferenceLabel(reference: PolicyReference | undefined, nodes: GraphNode[]) {
  if (!reference) return '—'
  if (reference.kind === 'builtin') return reference.id
  if (reference.kind === 'strategy') return nodes.find((node) => node.id === reference.id)?.data.title ?? reference.id
  return reference.id
}

export function summarizeDnsNode(data: Pick<BlockNodeData, 'dnsResolvers' | 'resolver'>) {
  const enabledResolvers = normalizeDnsResolvers(data.dnsResolvers, data.resolver).filter((resolver) => resolver.enabled)
  const primary = enabledResolvers[0]
  if (!primary) return undefined
  return {
    protocol: primary.kind.toUpperCase(),
    detail: primary.name.trim() || primary.address?.trim() || primary.id,
    additionalCount: enabledResolvers.length - 1,
  }
}

export function resolveFinalTargetSummary(
  data: Pick<BlockNodeData, 'targetKind' | 'targetId' | 'targetLabel'>,
  nodes: readonly GraphNode[],
  locale: Locale,
  missing: string,
) {
  if (data.targetKind === 'direct') return 'DIRECT'
  if (data.targetKind === 'reject') return 'REJECT'
  const targetId = data.targetId?.trim()
  if (data.targetKind === 'strategy' && targetId) {
    const target = nodes.find((node) => node.id === targetId)
    if (target) return localizeNodeTitle(target, locale)
  }
  const storedTarget = data.targetLabel?.trim() || targetId
  return storedTarget ? localizeKnownSystemText(storedTarget, locale) : missing
}

function subscriptionNodeStatus(runtime: ReturnType<typeof useBuilderStore.getState>['subscriptionRuntimes'][string] | undefined) {
  if (runtime?.refreshStatus === 'loading') return 'loading'
  if (runtime?.refreshStatus === 'failed') return 'error'
  if (runtime?.activeSnapshot && snapshotFreshness(runtime.activeSnapshot.committedAt) === 'stale') return 'stale'
  if (runtime?.activeSnapshot) return 'ready'
  return 'unavailable'
}

function subscriptionStatusLabel(runtime: ReturnType<typeof useBuilderStore.getState>['subscriptionRuntimes'][string] | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (runtime?.refreshStatus === 'loading') return t('inspector.sourceStatus.loading')
  if (runtime?.refreshStatus === 'failed') return t('inspector.refreshFailed')
  if (runtime?.activeState === 'empty') return t('inspector.sourceStatus.empty')
  if (runtime?.activeSnapshot && snapshotFreshness(runtime.activeSnapshot.committedAt) === 'stale') return t('inspector.sourceStatus.stale')
  return runtimeStatusLabel(runtime?.activeSnapshot ? 'ready' : 'unavailable', t)
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
  if (normalized === 'paused') return t('node.compatibility.paused')
  if (normalized === 'prototype') return t('node.compatibility.prototype')
  if (normalized === 'compiled') return t('node.compatibility.compiled')
  return localizeKnownSystemText(String(value ?? ''), 'en-US')
}

import { groupDiagnostics, type GroupedDiagnostic, type StructuredDiagnostic } from '../../core/compiler'
import {
  hasLocalizedDiagnosticMessage,
  localizeDiagnosticMessage,
  type Locale,
  type MessageKey,
  type TranslationValues,
} from '../../i18n'
import type { TargetProjectionReason, TargetProjectionSummary, TargetStrategyProjectionSummary } from '../../core/compiler'

export type DiagnosticTranslator = (key: MessageKey, values?: TranslationValues) => string

export interface DiagnosticPresentationContext {
  locale: Locale
  t: DiagnosticTranslator
  exportable?: boolean
  entityNames?: ReadonlyMap<string, string>
  targetProjection?: TargetProjectionSummary
}

export interface DiagnosticPresentation {
  key: string
  severity: StructuredDiagnostic['severity']
  title: string
  description: string
  impact: string
  action?: string
  occurrenceCount: number
  affectedCount?: number
  reasonSummaries: string[]
  projectionReasons?: TargetProjectionReason[]
  technicalDetails: GroupedDiagnostic<StructuredDiagnostic>[]
  locationIssue?: StructuredDiagnostic
}

export interface DiagnosticCountSummary {
  blockerCount: number
  warningGroupCount: number
  infoGroupCount: number
  badgeKind: 'error' | 'warning' | 'none'
  badgeCount?: number
}

const SURGE_SKIPPED = 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED'
const SURGE_MATERIALIZED = 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED'
const MIHOMO_VARIANT = 'MIHOMO_PROXY_VARIANT_UNSUPPORTED'

interface PresentationBucket {
  key: string
  firstIndex: number
  issues: StructuredDiagnostic[]
  occurrenceCount: number
  technicalDetails: GroupedDiagnostic<StructuredDiagnostic>[]
}

interface SurgeSkippedDetails {
  compatible: number
  total: number
  skipped: number
  strategy?: string
  reasons: Array<{ label: string; count: number }>
}

const structuredSurgeReasonMessages: Partial<Record<string, MessageKey>> = {
  SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED: 'diagnostic.surgeSkipped.reason.tlsFingerprint',
  SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED: 'diagnostic.surgeSkipped.reason.anytlsSession',
  SURGE_ANYTLS_UDP_DISABLE_UNSUPPORTED: 'diagnostic.surgeSkipped.reason.anytlsUdp',
}

type LoonPresentationKind =
  | 'unsupported'
  | 'unproven'
  | 'routingUnsupported'
  | 'routingUnproven'
  | 'serviceConflict'
  | 'sourceUnproven'
  | 'remoteSourceUnproven'

type ShadowrocketPresentationKind = 'unsupported' | 'unproven' | 'paused'

export function presentDiagnostics(
  issues: readonly StructuredDiagnostic[],
  context: DiagnosticPresentationContext,
): DiagnosticPresentation[] {
  return presentationBuckets(issues)
    .map((bucket) => presentBucket(bucket, context))
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
}

export function summarizeDiagnosticCounts(issues: readonly StructuredDiagnostic[]): DiagnosticCountSummary {
  const blockerCount = issues.filter((issue) => issue.severity === 'error').length
  const buckets = presentationBuckets(issues)
  const warningGroupCount = buckets.filter(({ issues: grouped }) => grouped[0]?.severity === 'warning').length
  const infoGroupCount = buckets.filter(({ issues: grouped }) => grouped[0]?.severity === 'info').length
  return {
    blockerCount,
    warningGroupCount,
    infoGroupCount,
    badgeKind: blockerCount > 0 ? 'error' : warningGroupCount > 0 ? 'warning' : 'none',
    ...(blockerCount > 0
      ? { badgeCount: blockerCount }
      : warningGroupCount > 0 ? { badgeCount: warningGroupCount } : {}),
  }
}

export function mergeProjectHealthDiagnostics(
  projectIssues: readonly StructuredDiagnostic[],
  primaryIssues: readonly StructuredDiagnostic[],
  compatibilityIssues: readonly StructuredDiagnostic[],
) {
  const primaryOnly = primaryIssues.filter((issue) => !compatibilityIssues.some((candidate) => (
    groupDiagnostics([candidate, issue]).length === 1
  )))
  return groupDiagnostics([...projectIssues, ...primaryOnly]).map(({ issue }) => issue)
}

function presentationBuckets(issues: readonly StructuredDiagnostic[]): PresentationBucket[] {
  const known = new Map<string, { firstIndex: number; issues: StructuredDiagnostic[] }>()
  const generic: StructuredDiagnostic[] = []
  for (const [index, issue] of issues.entries()) {
    const key = knownPresentationKey(issue, index)
    if (!key) {
      generic.push(issue)
      continue
    }
    const bucket = known.get(key)
    if (bucket) bucket.issues.push(issue)
    else known.set(key, { firstIndex: index, issues: [issue] })
  }

  const buckets: PresentationBucket[] = [...known].map(([key, bucket]) => ({
    key,
    firstIndex: bucket.firstIndex,
    issues: bucket.issues,
    occurrenceCount: bucket.issues.length,
    technicalDetails: groupDiagnostics(bucket.issues),
  }))
  for (const grouped of groupDiagnostics(generic)) {
    buckets.push({
      key: `generic:${grouped.issue.severity}:${grouped.issue.code}:${grouped.issue.entityId ?? grouped.issue.nodeId ?? ''}:${buckets.length}`,
      firstIndex: issues.indexOf(grouped.issue),
      issues: [grouped.issue],
      occurrenceCount: grouped.count,
      technicalDetails: [grouped],
    })
  }
  return buckets.sort((left, right) => left.firstIndex - right.firstIndex)
}

function knownPresentationKey(issue: StructuredDiagnostic, index: number) {
  if (issue.code === MIHOMO_VARIANT || issue.code === SURGE_MATERIALIZED) return `${issue.severity}:${issue.code}`
  if (issue.code === SURGE_SKIPPED) return `${issue.severity}:${issue.code}:${issue.entityId ?? issue.nodeId ?? index}`
  return undefined
}

function presentBucket(bucket: PresentationBucket, context: DiagnosticPresentationContext): DiagnosticPresentation {
  const issue = bucket.issues[0]
  if (issue.code === SURGE_SKIPPED) return presentSurgeSkipped(bucket, context)
  if (issue.code === SURGE_MATERIALIZED) return presentSurgeMaterialized(bucket, context)
  if (issue.code === MIHOMO_VARIANT) return presentMihomoVariant(bucket, context)
  const loonKind = loonPresentationKind(issue)
  if (loonKind) return presentLoon(bucket, context, loonKind)
  const shadowrocketKind = shadowrocketPresentationKind(issue)
  if (shadowrocketKind) return presentShadowrocket(bucket, context, shadowrocketKind)
  return presentGeneric(bucket, context)
}

function shadowrocketPresentationKind(issue: StructuredDiagnostic): ShadowrocketPresentationKind | undefined {
  if (!issue.code.startsWith('SHADOWROCKET_') || issue.severity !== 'error') return undefined
  if (issue.code === 'SHADOWROCKET_PRODUCT_SUPPORT_PAUSED') return 'paused'
  return issue.code.includes('UNPROVEN') ? 'unproven' : 'unsupported'
}

function presentShadowrocket(bucket: PresentationBucket, context: DiagnosticPresentationContext, kind: ShadowrocketPresentationKind): DiagnosticPresentation {
  const key = `diagnostic.shadowrocket.${kind}` as MessageKey
  return {
    ...basePresentation(bucket),
    title: context.t(`${key}.title` as MessageKey),
    description: context.t(`${key}.description` as MessageKey),
    impact: context.t(`${key}.impact` as MessageKey),
    action: context.t(`${key}.action` as MessageKey),
    reasonSummaries: [],
  }
}

function loonPresentationKind(issue: StructuredDiagnostic): LoonPresentationKind | undefined {
  const { code, severity } = issue
  if (!code.startsWith('LOON_') || severity !== 'error') return undefined
  if (code === 'LOON_SERVICE_RULE_POLICY_CONFLICT') return 'serviceConflict'
  if (code === 'LOON_RULE_SOURCE_FORMAT_UNPROVEN') return 'sourceUnproven'
  if (code === 'LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN') return 'remoteSourceUnproven'
  if (code === 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN') return 'routingUnproven'
  if (code === 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNSUPPORTED' || code === 'LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED') return 'routingUnsupported'
  if (code.includes('UNPROVEN')) return 'unproven'
  return 'unsupported'
}

function presentLoon(
  bucket: PresentationBucket,
  context: DiagnosticPresentationContext,
  kind: LoonPresentationKind,
): DiagnosticPresentation {
  const key = `diagnostic.loon.${kind}` as MessageKey
  return {
    ...basePresentation(bucket),
    title: context.t(`${key}.title` as MessageKey),
    description: context.t(`${key}.description` as MessageKey),
    impact: context.t(`${key}.impact` as MessageKey),
    action: context.t(`${key}.action` as MessageKey),
    reasonSummaries: [],
  }
}

function presentSurgeSkipped(bucket: PresentationBucket, context: DiagnosticPresentationContext): DiagnosticPresentation {
  const issue = bucket.issues[0]
  const projection = surgeStrategyProjection(context.targetProjection, issue.entityId ?? issue.nodeId)
  const parsed = projection ? undefined : parseSurgeSkippedDiagnostic(issue.message)
  const compatible = projection?.compatibleCount ?? parsed?.compatible
  const total = projection?.candidateCount ?? parsed?.total
  const skipped = projection?.skippedCount ?? parsed?.skipped
  const entityId = bucket.issues[0].entityId ?? bucket.issues[0].nodeId
  const strategy = entityId ? context.entityNames?.get(entityId) ?? parsed?.strategy : parsed?.strategy
  const hasCounts = compatible !== undefined && total !== undefined && skipped !== undefined
  const description = hasCounts
    ? strategy
      ? context.t('diagnostic.surgeSkipped.descriptionWithStrategy', { strategy, compatible, total, skipped })
      : context.t('diagnostic.surgeSkipped.description', { compatible, total, skipped })
    : context.t('diagnostic.surgeSkipped.descriptionFallback')
  return {
    ...basePresentation(bucket),
    title: skipped === undefined
      ? context.t('diagnostic.surgeSkipped.titleFallback')
      : context.t(skipped === 1 ? 'diagnostic.surgeSkipped.titleOne' : 'diagnostic.surgeSkipped.title', { count: skipped }),
    description,
    impact: context.exportable === false
      ? context.t('diagnostic.surgeSkipped.impactBlocked')
      : context.t('diagnostic.surgeSkipped.impactExportable'),
    action: context.t('diagnostic.surgeSkipped.action'),
    ...(skipped === undefined ? {} : { affectedCount: skipped }),
    ...(projection ? {
      projectionReasons: projection.reasons,
      reasonSummaries: presentStructuredSurgeSkipReasons(projection.reasons, context.t),
    } : { reasonSummaries: parsed ? presentSurgeSkipReasons(parsed.reasons, context.t) : [] }),
  }
}

function surgeStrategyProjection(
  summary: TargetProjectionSummary | undefined,
  strategyId: string | undefined,
): TargetStrategyProjectionSummary | TargetProjectionSummary | undefined {
  if (!summary || summary.target !== 'surge') return undefined
  if (strategyId) return summary.strategies.find((strategy) => strategy.strategyId === strategyId)
  return summary
}

function presentSurgeMaterialized(bucket: PresentationBucket, context: DiagnosticPresentationContext): DiagnosticPresentation {
  return {
    ...basePresentation(bucket),
    title: context.t('diagnostic.surgeMaterialized.title'),
    description: context.t('diagnostic.surgeMaterialized.description'),
    impact: context.t('diagnostic.surgeMaterialized.impact'),
    reasonSummaries: [],
  }
}

function presentMihomoVariant(bucket: PresentationBucket, context: DiagnosticPresentationContext): DiagnosticPresentation {
  return {
    ...basePresentation(bucket),
    title: context.t(bucket.occurrenceCount === 1 ? 'diagnostic.mihomoVariant.titleOne' : 'diagnostic.mihomoVariant.title', { count: bucket.occurrenceCount }),
    description: context.t('diagnostic.mihomoVariant.description'),
    impact: context.t('diagnostic.mihomoVariant.impact'),
    action: context.t('diagnostic.mihomoVariant.action'),
    affectedCount: bucket.occurrenceCount,
    reasonSummaries: [],
  }
}

function presentGeneric(bucket: PresentationBucket, context: DiagnosticPresentationContext): DiagnosticPresentation {
  const issue = bucket.issues[0]
  const localized = localizeDiagnosticMessage(issue.code, issue.message, context.locale)
  const description = hasLocalizedDiagnosticMessage(issue.code)
    ? localized
    : context.t(`diagnostic.generic.${issue.severity}Description`)
  return {
    ...basePresentation(bucket),
    title: context.t(`diagnostic.generic.${issue.severity}Title`),
    description,
    impact: context.t(`diagnostic.generic.${issue.severity}Impact`),
    ...(issue.severity === 'error'
      ? { action: context.t('diagnostic.generic.errorAction') }
      : issue.severity === 'warning' ? { action: context.t('diagnostic.generic.warningAction') } : {}),
    reasonSummaries: [],
  }
}

function basePresentation(bucket: PresentationBucket) {
  const entityIds = new Set(bucket.issues.map((issue) => issue.entityId ?? issue.nodeId).filter(Boolean))
  return {
    key: bucket.key,
    severity: bucket.issues[0].severity,
    occurrenceCount: bucket.occurrenceCount,
    technicalDetails: bucket.technicalDetails,
    ...(entityIds.size === 1 ? { locationIssue: bucket.issues[0] } : {}),
  }
}

function parseSurgeSkippedDiagnostic(message: string): SurgeSkippedDetails | undefined {
  const match = message.match(/^Surge can use (\d+) of (\d+) candidates(?: in strategy [“"](.+?)[”"])?\. (\d+)(?: incompatible)? endpoints? (?:was|were) skipped(?: \((.+)\))?\.$/u)
  if (!match) return undefined
  const reasons = (match[5] ?? '').split(', ').flatMap((entry) => {
    const reason = entry.match(/^(.+): (\d+)$/)
    return reason ? [{ label: reason[1], count: Number(reason[2]) }] : []
  })
  return {
    compatible: Number(match[1]),
    total: Number(match[2]),
    strategy: match[3],
    skipped: Number(match[4]),
    reasons,
  }
}

function presentSurgeSkipReasons(reasons: SurgeSkippedDetails['reasons'], t: DiagnosticTranslator) {
  const counts = new Map<'protocol' | 'plugin' | 'transport' | 'parameters', number>()
  const structured: string[] = []
  for (const reason of reasons) {
    const normalized = reason.label.toLocaleLowerCase()
    if (normalized === 'tls client fingerprint unsupported') {
      structured.push(t('diagnostic.surgeSkipped.reason.tlsFingerprint', { count: reason.count }))
      continue
    }
    if (normalized === 'anytls session parameters unsupported') {
      structured.push(t('diagnostic.surgeSkipped.reason.anytlsSession', { count: reason.count }))
      continue
    }
    if (normalized === 'anytls udp disable unsupported') {
      structured.push(t('diagnostic.surgeSkipped.reason.anytlsUdp', { count: reason.count }))
      continue
    }
    const kind = normalized === 'vless' || normalized === 'vmess'
      ? 'protocol'
      : normalized.includes('plugin')
        ? 'plugin'
        : normalized.includes('transport')
          ? 'transport'
          : 'parameters'
    counts.set(kind, (counts.get(kind) ?? 0) + reason.count)
  }
  return [...structured, ...[...counts].map(([kind, count]) => t(`diagnostic.surgeSkipped.reason.${kind}` as MessageKey, { count }))]
}

function presentStructuredSurgeSkipReasons(reasons: readonly TargetProjectionReason[], t: DiagnosticTranslator) {
  return reasons.map((reason) => {
    const key = structuredSurgeReasonMessages[reason.code]
    return key
      ? t(key, { count: reason.endpointCount })
      : t('diagnostic.surgeSkipped.reason.structured', { label: reason.label, count: reason.endpointCount })
  })
}

function severityRank(severity: StructuredDiagnostic['severity']) {
  return severity === 'error' ? 0 : severity === 'warning' ? 1 : 2
}

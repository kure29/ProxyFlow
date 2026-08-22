import type { RemoteProxySourceCapabilities } from '../capabilities'
import type { ProxyFlowIR, ProxySetRef, RemoteProxySourceIR } from '../ir'
import { analyzeProxySetLineage, type ProxySetLineage } from './lineage'

export type RemoteSourcePlanDecision = 'native-remote' | 'materialized' | 'unsupported'
export type RemoteSourceConsumer = 'select' | 'auto-select' | 'fallback' | 'load-balance' | 'fixed' | 'chain-hop'

export type RemoteSourceDiagnosticCode =
  | 'REMOTE_SOURCE_NATIVE'
  | 'REMOTE_SOURCE_MATERIALIZED'
  | 'REMOTE_SOURCE_TARGET_UNSUPPORTED'
  | 'REMOTE_SOURCE_PROCESSING_UNSUPPORTED'
  | 'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED'
  | 'REMOTE_SOURCE_SNAPSHOT_UNAVAILABLE'
  | 'REMOTE_SOURCE_MIXED_INPUTS'
  | 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED'
  | 'REMOTE_SOURCE_RUNTIME_DRIFT'
  | 'REMOTE_SOURCE_URL_EMBEDDED'
  | 'REMOTE_REQUEST_FALLBACK_NOT_PORTABLE'

export interface RemoteSourcePlanDiagnostic {
  code: RemoteSourceDiagnosticCode
  severity: 'info' | 'warning' | 'error'
  message: string
  sourceId?: string
}

export interface RemoteSourceLoweringPlan {
  decision: RemoteSourcePlanDecision
  lineage: ProxySetLineage
  source?: RemoteProxySourceIR
  diagnostics: RemoteSourcePlanDiagnostic[]
}

export interface RemoteProxySourceAdapter<TNative> {
  capabilities: RemoteProxySourceCapabilities
  lower(source: RemoteProxySourceIR): TNative
}

export function planRemoteProxySource(
  ir: ProxyFlowIR,
  ref: ProxySetRef,
  capabilities: RemoteProxySourceCapabilities,
  consumer: RemoteSourceConsumer,
): RemoteSourceLoweringPlan {
  const lineage = analyzeProxySetLineage(ir, ref)
  if (lineage.remoteSources.length === 0) return materialized(lineage)

  const forced = lineage.remoteSources.some((source) => source.exportMode === 'remote')
  const explicitlyMaterialized = lineage.remoteSources.every((source) => source.exportMode === 'materialized')
  if (explicitlyMaterialized) return materialized(lineage, 'REMOTE_SOURCE_MATERIALIZED', 'The source is configured to export its current materialized snapshot.')

  if (lineage.mixed || lineage.remoteSources.length !== 1 || lineage.sourceIds.length !== 1) return unavailable(
    lineage,
    forced,
    'REMOTE_SOURCE_MIXED_INPUTS',
    'Remote preservation is unavailable after combining multiple source lineages.',
  )

  const source = lineage.remoteSources[0]
  const irSource = ir.sources.find((item) => item.id === source.id)
  if (!source.snapshot || irSource?.kind !== 'subscription' || !irSource.proxies) return unavailable(
    lineage,
    forced,
    'REMOTE_SOURCE_SNAPSHOT_UNAVAILABLE',
    'Remote preservation requires a current parsed snapshot for validation and fallback compilation.',
    source,
  )
  if (lineage.operations.length > 0) return unavailable(
    lineage,
    forced,
    'REMOTE_SOURCE_PROCESSING_UNSUPPORTED',
    `Remote preservation is unavailable after ${lineage.operations.map((operation) => operation.kind).join(', ')} processing.`,
    source,
  )

  if (consumer === 'fixed' || consumer === 'chain-hop') return unavailable(
    lineage,
    forced,
    'REMOTE_SOURCE_PROCESSING_UNSUPPORTED',
    consumer === 'fixed'
      ? 'A fixed proxy requires a stable materialized endpoint identity.'
      : 'Proxy-chain hops require materialized endpoint membership.',
    source,
  )

  if (capabilities.source.status === 'unsupported') return unavailable(
    lineage,
    forced,
    'REMOTE_SOURCE_TARGET_UNSUPPORTED',
    'The target does not support native remote proxy sources.',
    source,
  )

  if (!capabilities.requestProfiles.includes(source.requestProfile)) return unavailable(
    lineage,
    forced,
    'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED',
    `The target cannot safely preserve the ${source.requestProfile} request profile.`,
    source,
  )

  return {
    decision: 'native-remote',
    lineage,
    source,
    diagnostics: [
      diagnostic('REMOTE_SOURCE_NATIVE', 'info', 'The target will load this remote subscription natively.', source.id),
      diagnostic('REMOTE_SOURCE_RUNTIME_DRIFT', 'info', 'Runtime nodes may differ from the current ProxyFlow snapshot after the target refreshes the source.', source.id),
      diagnostic('REMOTE_SOURCE_URL_EMBEDDED', 'warning', 'The remote subscription URL will be embedded in the exported configuration.', source.id),
      ...(source.requestProfile === 'auto' ? [diagnostic(
        'REMOTE_REQUEST_FALLBACK_NOT_PORTABLE',
        'info',
        'The target uses the preferred compatible request identity; ProxyFlow Runtime multi-identity fallback is not portable.',
        source.id,
      )] : []),
    ],
  }
}

function unavailable(
  lineage: ProxySetLineage,
  forced: boolean,
  code: RemoteSourceDiagnosticCode,
  message: string,
  source?: RemoteProxySourceIR,
): RemoteSourceLoweringPlan {
  if (!forced) return materialized(lineage, code, `${message} The current snapshot will be materialized.`, source)
  return {
    decision: 'unsupported',
    lineage,
    source,
    diagnostics: [
      diagnostic(code, 'error', message, source?.id),
      diagnostic('REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED', 'error', 'Remote export was required, so materialized fallback is not allowed.', source?.id),
    ],
  }
}

function materialized(
  lineage: ProxySetLineage,
  code?: RemoteSourceDiagnosticCode,
  message?: string,
  source?: RemoteProxySourceIR,
): RemoteSourceLoweringPlan {
  return {
    decision: 'materialized',
    lineage,
    source,
    diagnostics: code && message ? [diagnostic(code, 'info', message, source?.id)] : [],
  }
}

function diagnostic(
  code: RemoteSourceDiagnosticCode,
  severity: RemoteSourcePlanDiagnostic['severity'],
  message: string,
  sourceId?: string,
): RemoteSourcePlanDiagnostic {
  return { code, severity, message, ...(sourceId ? { sourceId } : {}) }
}

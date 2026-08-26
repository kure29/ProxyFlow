import type { ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { PROXYFLOW_IR_VERSION } from '../../core/ir'
import { compileShadowrocket } from './compiler'

/** Sanitized, network-free acceptance profile for serializer/fixture drift. */
export function shadowrocketAcceptanceIR(): ProxyFlowIR {
  const proxy: Extract<ResolvedProxyEndpointIR, { protocol: 'http' }> = {
    kind: 'http', protocol: 'http', id: 'acceptance-http', name: 'Acceptance HTTP', server: 'proxy.example.invalid', port: 8080,
  }
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'shadowrocket-acceptance', projectName: 'Shadowrocket Acceptance', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'acceptance-source', name: 'Acceptance Source', proxies: [proxy] }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'acceptance-select', name: 'Acceptance Proxy', candidates: [{ kind: 'source', id: 'acceptance-source' }] }],
    services: [],
    routes: [{ id: 'acceptance-route', name: 'Acceptance Route', matcher: { kind: 'domain-suffix', value: 'example.invalid' }, target: { kind: 'strategy', id: 'acceptance-select' }, priority: 10 }],
    finalRoute: { target: { kind: 'strategy', id: 'acceptance-select' } },
    outputs: [{ id: 'acceptance-output', name: 'Shadowrocket', target: 'shadowrocket', enabled: true }],
    dns: { enabled: true, mode: 'custom', resolvers: [{ id: 'system', name: 'System', kind: 'system', role: 'default' }] },
  }
}

export function compileShadowrocketAcceptance(now = () => new Date('2026-08-25T00:00:00.000Z')) {
  return compileShadowrocket(shadowrocketAcceptanceIR(), { now })
}

export function acceptanceDiagnosticCounts(result: ReturnType<typeof compileShadowrocketAcceptance>) {
  return {
    candidateCount: result.stats?.candidateCount ?? 0,
    compatibleEndpointCount: result.stats?.compatibleEndpointCount ?? 0,
    skippedEndpointCount: result.stats?.skippedEndpointCount ?? 0,
    blockingIssueCount: result.stats?.blockingIssueCount ?? result.issues.filter((issue) => issue.severity === 'error').length,
    issueCodeCounts: Object.fromEntries([...new Set(result.issues.map((issue) => issue.code))].sort().map((code) => [code, result.issues.filter((issue) => issue.code === code).length])),
  }
}

import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../ir'
import { detectChainCycles } from './detectChainCycles'
import { validateIR } from './validateIR'

const baseIR = (): ProxyFlowIR => ({
  version: PROXYFLOW_IR_VERSION,
  metadata: { projectId: 'test', projectName: 'Test', projectSchemaVersion: 1 },
  sources: [],
  transforms: [],
  strategies: [],
  services: [],
  routes: [],
  finalRoute: { target: { kind: 'direct' } },
  outputs: [{ id: 'output', name: 'Output', target: 'mihomo', enabled: true }],
})

describe('validateIR', () => {
  it('validates references without graph or UI dependencies', () => {
    const ir = baseIR()
    ir.transforms.push({ kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'missing' }, include: [], exclude: [] })
    expect(validateIR(ir).map((issue) => issue.code)).toEqual(expect.arrayContaining(['PROXY_SET_REFERENCE_NOT_FOUND', 'FILTER_EMPTY']))
  })

  it('detects multi-chain cycles with a stable path', () => {
    const strategies: ProxyFlowIR['strategies'] = [
      { kind: 'chain', id: 'a', name: 'A', hops: [{ kind: 'strategy', id: 'b' }] },
      { kind: 'chain', id: 'b', name: 'B', hops: [{ kind: 'strategy', id: 'c' }] },
      { kind: 'chain', id: 'c', name: 'C', hops: [{ kind: 'strategy', id: 'a' }] },
    ]
    expect(detectChainCycles(strategies)).toEqual([['a', 'b', 'c', 'a']])
    const ir = baseIR()
    ir.strategies = strategies
    expect(validateIR(ir).some((issue) => issue.code === 'CHAIN_CYCLE')).toBe(true)
  })

  it('requires final route and output semantics', () => {
    const ir = baseIR()
    ir.finalRoute = undefined
    ir.outputs = []
    expect(validateIR(ir).map((issue) => issue.code)).toEqual(expect.arrayContaining(['FINAL_MISSING', 'OUTPUT_MISSING']))
  })

  it('validates structured Hysteria2 port hopping and hop intervals at the IR boundary', () => {
    const ir = baseIR()
    ir.sources = [{
      kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
        kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2', name: 'HY2', server: 'hy2.example.com', port: 443,
        password: 'test-password', tls: { enabled: true },
        serverPorts: [{ kind: 'range', start: 6000, end: 5000 }],
        hopInterval: { kind: 'range', minSeconds: 30, maxSeconds: 15 },
      }],
    }]
    expect(validateIR(ir).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'PROXY_HYSTERIA2_PORT_HOPPING_INVALID', 'PROXY_HYSTERIA2_HOP_INTERVAL_INVALID',
    ]))
  })

  it.each([
    [{
      kind: 'vless', protocol: 'vless', id: 'vision', name: 'Vision', server: 'vless.example.com', port: 443,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', security: 'none', flow: 'xtls-rprx-vision', tls: { enabled: false },
    }, 'PROXY_VLESS_VISION_TLS_REQUIRED'],
    [{
      kind: 'vless', protocol: 'vless', id: 'reality', name: 'Reality', server: 'vless.example.com', port: 443,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', security: 'reality',
      tls: { enabled: false, serverName: 'www.example.com', reality: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } },
    }, 'PROXY_REALITY_TLS_REQUIRED'],
  ] satisfies Array<[ResolvedProxyEndpointIR, string]>)('rejects direct IR that violates VLESS secure transport invariants', (proxy, code) => {
    const ir = irWithProxy(proxy)
    const issue = validateIR(ir).find((item) => item.code === code)
    expect(issue).toEqual(expect.objectContaining({ severity: 'error', entity: { type: 'source', id: 'source' } }))
  })

  it.each([
    { kind: 'trojan', protocol: 'trojan', id: 'trojan', name: 'Trojan', server: 'trojan.example.com', port: 443, password: 'demo', tls: { enabled: false } },
    { kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2', name: 'HY2', server: 'hy2.example.com', port: 443, password: 'demo', tls: { enabled: false } },
    { kind: 'tuic', protocol: 'tuic', id: 'tuic', name: 'TUIC', server: 'tuic.example.com', port: 443, uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', password: 'demo', tls: { enabled: false } },
  ] satisfies ResolvedProxyEndpointIR[])('rejects disabled TLS for direct $protocol IR', (proxy) => {
    const issue = validateIR(irWithProxy(proxy)).find((item) => item.code === 'PROXY_TLS_REQUIRED')
    expect(issue).toEqual(expect.objectContaining({ severity: 'error', entity: { type: 'source', id: 'source' } }))
  })

  it('rejects malformed Hysteria2 runtime semantics including bandwidth', () => {
    const ir = irWithProxy({
      kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2', name: 'HY2', server: 'hy2.example.com', port: 443,
      password: 'demo', tls: { enabled: true }, upMbps: Number.NaN,
      serverPorts: [{ kind: 'range', start: 6000, end: 5000 }],
    })
    expect(validateIR(ir).filter((issue) => issue.severity === 'error').map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'PROXY_HYSTERIA2_BANDWIDTH_INVALID', 'PROXY_HYSTERIA2_PORT_HOPPING_INVALID',
    ]))
  })
})

function irWithProxy(proxy: ResolvedProxyEndpointIR) {
  const ir = baseIR()
  ir.sources = [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [proxy] }]
  return ir
}

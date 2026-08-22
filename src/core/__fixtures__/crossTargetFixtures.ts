import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'

export function explicitProxyIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: {
      projectId: 'cross-target-explicit',
      projectName: 'Cross-target Explicit Proxies',
      projectSchemaVersion: 2,
    },
    sources: [
      {
        kind: 'manual-proxy', id: 'hk-source', name: 'Hong Kong', proxies: [
          { kind: 'socks', protocol: 'socks5', version: '5', id: 'hk-socks', name: 'HK SOCKS', server: 'hk.example.com', port: 1080 },
        ],
      },
      {
        kind: 'manual-proxy', id: 'us-source', name: 'United States', proxies: [
          { kind: 'http', protocol: 'http', id: 'us-http', name: 'US HTTP', server: 'us-http.example.com', port: 8080, username: 'alice', password: 'secret' },
          { kind: 'socks', protocol: 'socks5', version: '5', id: 'us-socks', name: 'US SOCKS', server: '203.0.113.20', port: 1080 },
        ],
      },
    ],
    transforms: [],
    strategies: [
      {
        kind: 'auto-select', id: 'hk-auto', name: 'Hong Kong Auto', source: { kind: 'source', id: 'hk-source' },
        healthCheck: { url: 'https://www.gstatic.com/generate_204', intervalSeconds: 180, toleranceMs: 80 },
      },
      {
        kind: 'select', id: 'us-select', name: 'US Select', candidates: [{ kind: 'source', id: 'us-source' }],
      },
      {
        kind: 'auto-select', id: 'us-auto', name: 'US Auto', source: { kind: 'source', id: 'us-source' },
      },
    ],
    services: [
      {
        id: 'openai', name: 'OpenAI', ruleSources: [], inlineMatchers: [
          { kind: 'domain', value: 'api.openai.com' },
          { kind: 'domain-suffix', value: 'openai.com' },
        ],
      },
      {
        id: 'china', name: 'China', ruleSources: [], inlineMatchers: [
          { kind: 'domain-suffix', value: 'cn' },
          { kind: 'ip-cidr', value: '10.0.0.0/8' },
        ],
      },
    ],
    routes: [
      { id: 'openai-route', name: 'OpenAI', matcher: { kind: 'service', serviceIds: ['openai'] }, target: { kind: 'strategy', id: 'us-select' }, priority: 10 },
      { id: 'china-route', name: 'China', matcher: { kind: 'service', serviceIds: ['china'] }, target: { kind: 'direct' }, priority: 20 },
      { id: 'ads-route', name: 'Ads', matcher: { kind: 'domain-keyword', value: 'advert' }, target: { kind: 'reject' }, priority: 30 },
    ],
    finalRoute: { target: { kind: 'strategy', id: 'us-auto' } },
    outputs: [
      { id: 'mihomo-output', name: 'Mihomo', target: 'mihomo', enabled: true },
      { id: 'singbox-output', name: 'sing-box', target: 'sing-box', enabled: true },
    ],
    dns: {
      enabled: true,
      mode: 'custom',
      resolvers: [{ id: 'cloudflare-doh', kind: 'doh', address: 'https://1.1.1.1/dns-query' }],
    },
  }
}

export function chainIR(hops: 2 | 3): ProxyFlowIR {
  const ir = explicitProxyIR()
  if (hops === 3) {
    ir.sources.splice(1, 0, {
      kind: 'manual-proxy', id: 'jp-source', name: 'Japan', proxies: [
        { kind: 'http', protocol: 'http', id: 'jp-http', name: 'JP HTTP', server: 'jp.example.com', port: 8080 },
      ],
    })
    ir.strategies.splice(1, 0, {
      kind: 'auto-select', id: 'jp-auto', name: 'Japan Auto', source: { kind: 'source', id: 'jp-source' },
    })
  }
  ir.strategies.push({
    kind: 'chain', id: 'chain', name: hops === 2 ? 'US via HK' : 'US via HK JP',
    hops: (hops === 2 ? ['hk-auto', 'us-auto'] : ['hk-auto', 'jp-auto', 'us-auto'])
      .map((id) => ({ kind: 'strategy' as const, id })),
  })
  ir.finalRoute = { target: { kind: 'strategy', id: 'chain' } }
  return ir
}

export function unresolvedSubscriptionIR(): ProxyFlowIR {
  const ir = explicitProxyIR()
  ir.sources = [{ kind: 'provider', id: 'remote', name: 'Remote', reference: 'https://example.com/provider.yaml', enabled: true }]
  ir.strategies = [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'remote' } }]
  ir.routes = []
  ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
  return ir
}

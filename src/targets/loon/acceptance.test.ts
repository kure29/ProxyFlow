import { describe, expect, it } from 'vitest'
import projectText from '../../../fixtures/loon/acceptance-project.json?raw'
import expectedProfile from '../../../fixtures/loon/acceptance.expected.conf?raw'
import ipFixtureText from '../../../fixtures/loon/routing-ip-project.json?raw'
import ipExpected from '../../../fixtures/loon/routing-ip.expected.conf?raw'
import dohFixtureText from '../../../fixtures/loon/dns-doh-project.json?raw'
import dohExpected from '../../../fixtures/loon/dns-doh.expected.conf?raw'
import simpleObfsSource from '../../../fixtures/loon/simple-obfs-source.yaml?raw'
import { acceptanceDiagnosticCounts, compileLoonAcceptanceIr, compileLoonAcceptanceProject } from './acceptance'

const project = JSON.parse(projectText)

describe('Loon real-client acceptance fixture', () => {
  it('compiles the checked-in sanitized project to the exact golden profile', () => {
    const result = compileLoonAcceptanceProject(project)
    expect(result.graph.success).toBe(true)
    expect(result.loon?.success).toBe(true)
    expect(result.loon?.content).toBe(expectedProfile)
    expect(acceptanceDiagnosticCounts(result)).toEqual(expect.objectContaining({
      candidateCount: 11,
      compatibleEndpointCount: 11,
      skippedEndpointCount: 0,
      blockingIssueCount: 0,
    }))
  })

  it('keeps exact protocol, strategy, routing, and DNS tokens in the golden', () => {
    for (const line of [
      'HTTP Plain = http,http.example.com,8080',
      'HTTPS Credentials = https,https.example.com,443,fixture-user,"fixture-password",tls-name=https.example.com',
      'Shadowsocks AES = Shadowsocks,ss-aes.example.com,8388,aes-128-gcm,"ss-aes-password",udp=true',
      'Shadowsocks Chacha = Shadowsocks,ss-chacha.example.com,8389,chacha20,"ss-chacha-password",udp=true',
      'Shadowsocks Obfs = Shadowsocks,ss-obfs.example.com,8390,aes-128-gcm,"ss-obfs-password",obfs-name=http,obfs-host=obfs.example.com,obfs-uri=/proxy,udp=true',
      'VMess TCP = vmess,vmess-tcp.example.com,443,aes-128-gcm,"11111111-1111-4111-8111-111111111111",transport=tcp,alterId=0,over-tls=false',
      'VMess WS = vmess,vmess-ws.example.com,443,aes-128-gcm,"22222222-2222-4222-8222-222222222222",transport=ws,alterId=0,path=/vmess,host=cdn.example.com,over-tls=true,tls-name=vmess-ws.example.com',
      'VLESS TCP = VLESS,vless-tcp.example.com,443,"33333333-3333-4333-8333-333333333333",transport=tcp,over-tls=true,tls-name=vless-tcp.example.com',
      'VLESS WS = VLESS,vless-ws.example.com,443,"44444444-4444-4444-8444-444444444444",transport=ws,path=/vless,host=cdn.example.com,over-tls=true,tls-name=vless-ws.example.com',
      'Hysteria2 Minimal = Hysteria2,hy2.example.com,443,"hy2-password",tls-name=hy2.example.com,udp=true',
      'Round Robin = load-balance,HTTP Plain,HTTPS Credentials,Shadowsocks AES,Shadowsocks Chacha,Shadowsocks Obfs,Trojan TCP,VMess TCP,VMess WS,VLESS TCP,VLESS WS,Hysteria2 Minimal,algorithm=Round-Robin',
      'dns-server = system',
      'final,Nested Select',
    ]) expect(expectedProfile).toContain(line)
    expect(expectedProfile).toContain('[Proxy Group]')
    expect(expectedProfile).toContain('URL Test = url-test,')
    expect(expectedProfile).toContain('Fallback = fallback,')
  })

  it('lowers the source-shaped simple-obfs fixture to Loon target syntax', () => {
    const result = compileLoonAcceptanceProject(project, simpleObfsSource)
    expect(result.loon?.success).toBe(true)
    expect(result.loon?.content).toContain('Simple Obfs Source = Shadowsocks,obfs.example.invalid,8388,aes-128-gcm,"fixture-password",obfs-name=http,obfs-host=cdn.example.invalid,udp=true')
    expect(result.loon?.content).not.toContain('obfs-uri=')
  })

  it('retains compatible members and only warns for an inactive-in-pool SOCKS endpoint', () => {
    const content = [
      'proxies:',
      '  - name: Compatible HTTP',
      '    type: http',
      '    server: compatible.example.com',
      '    port: 8080',
      '  - name: Deferred SOCKS',
      '    type: socks5',
      '    server: socks.example.com',
      '    port: 1080',
    ].join('\n')
    const result = compileLoonAcceptanceProject(project, content)
    const counts = acceptanceDiagnosticCounts(result)
    expect(result.loon?.success).toBe(true)
    expect(counts).toEqual(expect.objectContaining({ candidateCount: 2, compatibleEndpointCount: 1, skippedEndpointCount: 1, blockingIssueCount: 0 }))
    expect(counts.issueCodeCounts).toEqual(expect.objectContaining({ LOON_PROXY_SET_ENDPOINTS_SKIPPED: 4 }))
    expect(result.loon?.content).not.toContain('socks.example.com')
  })

  it('blocks a fixed strategy and active pools when every local endpoint is unproven', () => {
    const content = [
      'proxies:',
      '  - name: Deferred SOCKS',
      '    type: socks5',
      '    server: socks.example.com',
      '    port: 1080',
    ].join('\n')
    const result = compileLoonAcceptanceProject(project, content)
    const codes = new Set(result.loon?.issues.map((issue) => issue.code))
    expect(result.loon?.success).toBe(false)
    expect(codes.has('LOON_PROXY_PROTOCOL_UNSUPPORTED')).toBe(true)
    expect(codes.has('LOON_STRATEGY_NO_COMPATIBLE_MEMBERS')).toBe(true)
    expect(codes.has('LOON_FIXED_PROXY_UNRESOLVED')).toBe(false)
    expect(acceptanceDiagnosticCounts(result)).toEqual(expect.objectContaining({ candidateCount: 1, compatibleEndpointCount: 0, skippedEndpointCount: 1 }))
  })

  it('does not let an earlier incompatible inventory item poison a compatible Fixed selection', () => {
    const content = [
      'proxies:',
      '  - name: First SOCKS',
      '    type: socks5',
      '    server: first-socks.example.invalid',
      '    port: 1080',
      '  - name: Second HTTP',
      '    type: http',
      '    server: second-http.example.invalid',
      '    port: 8080',
    ].join('\n')
    const result = compileLoonAcceptanceProject(project, content)
    expect(result.loon?.success).toBe(true)
    expect(result.loon?.content).toContain('Fixed = select,Second HTTP')

    const explicitlyFixed = compileLoonAcceptanceProject(project, content, { fixedProxyMode: 'first' })
    expect(explicitlyFixed.loon?.success).toBe(false)
    expect(explicitlyFixed.loon?.issues).toContainEqual(expect.objectContaining({ code: 'LOON_PROXY_PROTOCOL_UNSUPPORTED', severity: 'error' }))
  })

  it('is byte deterministic and does not expose endpoint content in safe statistics', () => {
    const first = compileLoonAcceptanceProject(project)
    const second = compileLoonAcceptanceProject(project)
    expect(first.loon?.content).toBe(second.loon?.content)
    const report = JSON.stringify(acceptanceDiagnosticCounts(first))
    expect(report).not.toContain('fixture-password')
    expect(report).not.toContain('example.com')
  })

  it('keeps the focused pure IP-family fixture ordered and leaves FINAL valid', () => {
    const result = compileLoonAcceptanceIr(JSON.parse(ipFixtureText))
    expect(result.success).toBe(true)
    expect(result.content).toBe(ipExpected)
    expect(result.content).toContain('IP-CIDR,192.0.2.0/24,IP Select')
    expect(result.content).toContain('IP-CIDR6,2001:db8::/32,DIRECT')
    expect(result.content).toContain('geoip,US,REJECT')
    expect(result.content).toContain('final,IP Select')
  })

  it('keeps the focused pure DoH fixture in doh-server order', () => {
    const result = compileLoonAcceptanceIr(JSON.parse(dohFixtureText))
    expect(result.success).toBe(true)
    expect(result.content).toBe(dohExpected)
    expect(result.content).toContain('doh-server = https://dns1.example.invalid/dns-query,https://dns2.example.invalid/dns-query')
  })
})

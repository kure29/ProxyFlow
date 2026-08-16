import { subscriptionIssue } from '../errors'
import { finalizeEndpoint, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

export function parseSocksLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const url = new URL(input.replace(/^socks:\/\//i, 'socks5://'))
    const port = validPort(url.port)
    if (!url.hostname || !port) throw new Error('invalid endpoint')
    const name = safeDecode(url.hash.slice(1)) || `SOCKS5 ${url.hostname}`
    return finalizeEndpoint({
      kind: 'socks', protocol: 'socks5', version: '5', name, server: url.hostname, port,
      ...(url.username ? { username: safeDecode(url.username) } : {}),
      ...(url.password ? { password: safeDecode(url.password) } : {}),
    }, context)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'SOCKS5 节点缺少有效的服务器或端口。', { line: context.line })
    return unsupportedNode('socks5', 'Malformed SOCKS5 node', context, issue)
  }
}

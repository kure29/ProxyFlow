import { subscriptionIssue } from '../errors'
import { finalizeEndpoint, safeDecode, unsupportedNode, validPort, type ParsedProtocolResult, type ProtocolParseContext } from '../utils'

export function parseHttpLink(input: string, context: ProtocolParseContext): ParsedProtocolResult {
  try {
    const url = new URL(input)
    const port = validPort(url.port || (url.protocol === 'https:' ? 443 : 80))
    if (!url.hostname || !port) throw new Error('invalid endpoint')
    const name = safeDecode(url.hash.slice(1)) || `${url.protocol === 'https:' ? 'HTTPS' : 'HTTP'} ${url.hostname}`
    return finalizeEndpoint({
      kind: 'http', protocol: 'http', name, server: url.hostname, port,
      ...(url.username ? { username: safeDecode(url.username) } : {}),
      ...(url.password ? { password: safeDecode(url.password) } : {}),
      ...(url.protocol === 'https:' ? { tls: { enabled: true, serverName: url.hostname } } : {}),
    }, context)
  } catch {
    const issue = subscriptionIssue('PROXY_LINK_MALFORMED', 'error', 'HTTP 节点缺少有效的服务器或端口。', { line: context.line })
    return unsupportedNode('http', 'Malformed HTTP node', context, issue)
  }
}

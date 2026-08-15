import type { GraphEdge, GraphNode, ValidationIssue } from '../../types/project'

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const incoming = (id: string) => edges.some((edge) => edge.target === id)
  const outgoing = (id: string) => edges.some((edge) => edge.source === id)

  for (const node of nodes) {
    if (node.data.disabled) continue
    const add = (message: string, severity: 'warning' | 'error' = 'warning') => {
      issues.push({ id: `${node.id}-${issues.length}`, nodeId: node.id, severity, message })
    }
    if (['subscription', 'manual-proxy', 'provider'].includes(node.data.blockType) && !outgoing(node.id)) add('这个数据源还没有连接到处理流程')
    if (['auto-select', 'manual-select', 'fallback', 'load-balance'].includes(node.data.blockType) && !incoming(node.id)) add('这个策略缺少节点来源')
    if (node.data.blockType === 'proxy-chain' && (node.data.hopIds?.length ?? 0) === 0) add('代理链至少需要一跳', 'error')
    if (['routing-group', 'service-rule', 'custom-rule'].includes(node.data.blockType) && !node.data.targetId) add('这个分流规则还没有目标策略')
    if (node.data.blockType === 'final' && !outgoing(node.id)) add('Final 必须连接到一个出口', 'error')
    if (node.data.blockType === 'output' && !node.data.client) add('请选择目标客户端', 'error')
  }
  return issues
}

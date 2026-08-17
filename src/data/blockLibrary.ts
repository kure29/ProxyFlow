import type { BlockCategory, BlockType } from '../types/project'

export interface BlockLibraryItem {
  type: BlockType
  category: BlockCategory
  title: string
  description: string
  icon: string
}

export interface BlockLibraryGroup {
  category: BlockCategory
  label: string
  advanced?: boolean
  items: BlockLibraryItem[]
}

export const blockLibrary: BlockLibraryGroup[] = [
  {
    category: 'source', label: '数据源', items: [
      { type: 'subscription', category: 'source', title: '订阅源', description: '导入远程节点订阅', icon: 'radio' },
      { type: 'manual-proxy', category: 'source', title: '手动节点', description: '添加单个代理节点', icon: 'server' },
      { type: 'provider', category: 'source', title: 'Proxy Provider', description: '引用节点提供方', icon: 'cloud' },
      { type: 'import-config', category: 'source', title: '配置导入', description: '从现有配置开始', icon: 'file-input' },
    ],
  },
  {
    category: 'processing', label: '节点处理', items: [
      { type: 'filter', category: 'processing', title: '节点筛选', description: '按名称、地区或条件过滤', icon: 'list-filter' },
      { type: 'rename', category: 'processing', title: '重命名', description: '批量规范节点名称', icon: 'text-cursor' },
      { type: 'sort', category: 'processing', title: '排序', description: '按名称、地区或协议排序', icon: 'arrow-down-up' },
      { type: 'deduplicate', category: 'processing', title: '去重', description: '合并重复的节点', icon: 'copy-minus' },
      { type: 'merge', category: 'processing', title: '合并节点', description: '合并多个节点池', icon: 'git-merge' },
      { type: 'limit', category: 'processing', title: '限制数量', description: '保留指定数量节点', icon: 'list-end' },
    ],
  },
  {
    category: 'strategy', label: '策略', items: [
      { type: 'manual-select', category: 'strategy', title: '手动选择', description: '由用户指定活动节点', icon: 'mouse-pointer-2' },
      { type: 'auto-select', category: 'strategy', title: '自动选择最快', description: '持续选择延迟最低节点', icon: 'gauge' },
      { type: 'fallback', category: 'strategy', title: '故障切换', description: '不可用时自动切换', icon: 'refresh-cw' },
    ],
  },
  {
    category: 'strategy', label: '高级策略', advanced: true, items: [
      { type: 'load-balance', category: 'strategy', title: '负载均衡', description: '在节点间分配连接', icon: 'scale' },
    ],
  },
  {
    category: 'chain', label: '高级路由', advanced: true, items: [
      { type: 'proxy-chain', category: 'chain', title: '代理链', description: '串联多个策略形成链路', icon: 'route' },
    ],
  },
  {
    category: 'routing', label: '分流', items: [
      { type: 'service-rule', category: 'routing', title: '分流规则', description: '按服务、域名、CIDR 或端口匹配流量', icon: 'waypoints' },
      { type: 'final', category: 'routing', title: 'Final', description: '其余流量的最终去向', icon: 'corner-down-right' },
    ],
  },
  {
    category: 'dns', label: 'DNS', advanced: true, items: [
      { type: 'dns', category: 'dns', title: 'DNS 配置', description: '设置域名解析策略', icon: 'globe-2' },
    ],
  },
  {
    category: 'output', label: '输出', items: [
      { type: 'output', category: 'output', title: 'Output', description: '选择目标客户端并导出', icon: 'package-check' },
    ],
  },
]

// Legacy routing entries remain resolvable for old Projects but are not product entry points.
const legacyRoutingItems: BlockLibraryItem[] = [
  { type: 'routing-group', category: 'routing', title: 'Legacy routing group', description: 'Compatibility-only routing node', icon: 'waypoints' },
  { type: 'custom-rule', category: 'routing', title: 'Legacy custom rule', description: 'Compatibility-only matcher node', icon: 'braces' },
]
const legacyStrategyItems: BlockLibraryItem[] = [
  { type: 'fixed-proxy', category: 'strategy', title: 'Legacy fixed proxy', description: 'Compatibility-only fixed strategy', icon: 'pin' },
]

export const blockByType = new Map([...blockLibrary.flatMap((group) => group.items), ...legacyRoutingItems, ...legacyStrategyItems].map((item) => [item.type, item]))

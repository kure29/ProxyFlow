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
      { type: 'load-balance', category: 'strategy', title: '负载均衡', description: '在节点间分配连接', icon: 'scale' },
      { type: 'fixed-proxy', category: 'strategy', title: '固定节点', description: '固定使用指定代理', icon: 'pin' },
    ],
  },
  {
    category: 'chain', label: '高级路由', items: [
      { type: 'proxy-chain', category: 'chain', title: '代理链', description: '串联多个策略形成链路', icon: 'route' },
    ],
  },
  {
    category: 'routing', label: '服务分流', items: [
      { type: 'routing-group', category: 'routing', title: '分流规则组', description: '一组服务流量的去向', icon: 'waypoints' },
      { type: 'service-rule', category: 'routing', title: '服务规则', description: '按服务选择流量', icon: 'blocks' },
      { type: 'custom-rule', category: 'routing', title: '自定义规则', description: '使用高级匹配条件', icon: 'braces' },
      { type: 'final', category: 'routing', title: 'Final', description: '其余流量的最终去向', icon: 'corner-down-right' },
    ],
  },
  {
    category: 'dns', label: 'DNS', items: [
      { type: 'dns', category: 'dns', title: 'DNS 配置', description: '设置域名解析策略', icon: 'globe-2' },
    ],
  },
  {
    category: 'output', label: '输出', items: [
      { type: 'output', category: 'output', title: 'Output', description: '选择目标客户端并导出', icon: 'package-check' },
    ],
  },
]

export const blockByType = new Map(blockLibrary.flatMap((group) => group.items).map((item) => [item.type, item]))

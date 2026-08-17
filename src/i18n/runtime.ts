import type { BlockNodeData, BlockType, GraphNode, ProxyFlowProject } from '../types/project'
import type { SubscriptionSnapshot } from '../core/subscription'
import { regionLabelForLocale } from '../core/proxy/region'
import { enUS, type MessageKey, zhCN } from './messages'

export type Locale = 'zh-CN' | 'en-US'
export type TranslationValues = Record<string, string | number>

const STORAGE_KEY = 'proxyflow.locale'
const dictionaries: Record<Locale, Record<MessageKey, string>> = { 'en-US': enUS, 'zh-CN': zhCN }
const messageKeys = new Set<string>(Object.keys(enUS))

function detectInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'zh-CN' || stored === 'en-US') return stored
    } catch {
      // Storage can be unavailable in hardened browser contexts; browser language remains a safe fallback.
    }
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

let currentLocale: Locale = detectInitialLocale()

export function getCurrentLocale() {
  return currentLocale
}

export function setCurrentLocale(locale: Locale) {
  currentLocale = locale
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, locale) } catch { /* Keep the in-memory preference. */ }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
    document.title = locale === 'zh-CN' ? 'ProxyFlow · 代理配置蓝图' : 'ProxyFlow · Proxy configuration blueprint'
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', translate(locale, 'app.metaDescription'))
  }
}

export function translate(locale: Locale, key: MessageKey, values: TranslationValues = {}) {
  return interpolate(dictionaries[locale][key], values)
}

export function translateCurrent(key: MessageKey, values: TranslationValues = {}) {
  return translate(currentLocale, key, values)
}

export function isMessageKey(value?: string): value is MessageKey {
  return Boolean(value && messageKeys.has(value))
}

export function blockTitleKey(type: BlockType): MessageKey {
  return `block.${type}.title` as MessageKey
}

export function blockDescriptionKey(type: BlockType): MessageKey {
  return `block.${type}.description` as MessageKey
}

export function categoryKey(category: BlockNodeData['category']): MessageKey {
  return `category.${category}` as MessageKey
}

export function localizeNodeTitle(node: GraphNode | { data: BlockNodeData }, locale: Locale) {
  return localizeDataValue(node.data.title, node.data.titleKey, locale)
}

export function localizeNodeSubtitle(node: GraphNode | { data: BlockNodeData }, locale: Locale) {
  return localizeDataValue(node.data.subtitle, node.data.subtitleKey, locale)
}

export function localizeDataValue(value: unknown, key: unknown, locale: Locale) {
  if (typeof key === 'string' && isMessageKey(key)) return translate(locale, key)
  return typeof value === 'string' ? localizeKnownSystemText(value, locale) : String(value ?? '')
}

export function localizeProjectName(value: string, locale: Locale) {
  return localizeKnownSystemText(value, locale)
}

export function localizeNodeData(data: BlockNodeData, locale: Locale): BlockNodeData {
  return {
    ...data,
    title: localizeDataValue(data.title, data.titleKey, locale),
    subtitle: localizeDataValue(data.subtitle, data.subtitleKey, locale),
    ...(data.targetLabel ? { targetLabel: localizeKnownSystemText(data.targetLabel, locale) } : {}),
    ...(data.strategyMode ? { strategyMode: localizeKnownSystemText(data.strategyMode, locale) } : {}),
    ...(data.updatedAt ? { updatedAt: localizeKnownSystemText(data.updatedAt, locale) } : {}),
  }
}

export function localizeProject(project: ProxyFlowProject, locale = currentLocale): ProxyFlowProject {
  return {
    ...project,
    name: localizeProjectName(project.name, locale),
    graph: {
      nodes: project.graph.nodes.map((node) => ({
        ...node,
        data: localizeNodeData(normalizeDemoFilterData(project.id, node.id, node.data), locale),
      })),
      edges: project.graph.edges,
    },
  }
}

export function localizeSubscriptionSnapshots(snapshots: Record<string, SubscriptionSnapshot>, locale: Locale) {
  return Object.fromEntries(Object.entries(snapshots).map(([id, snapshot]) => [id, snapshot.result ? {
    ...snapshot,
    result: {
      ...snapshot.result,
      proxies: snapshot.result.proxies.map((endpoint) => ({
        ...endpoint,
        name: localizeDemoProxyName(endpoint.name, id, locale),
        metadata: endpoint.metadata ? { ...endpoint.metadata, sourceName: endpoint.metadata.sourceName ? localizeKnownSystemText(endpoint.metadata.sourceName, locale) : endpoint.metadata.sourceName } : endpoint.metadata,
      })),
      nodes: snapshot.result.nodes.map((node) => ({
        ...node,
        name: localizeDemoProxyName(node.name, id, locale),
        sourceName: localizeKnownSystemText(node.sourceName, locale),
        endpoint: node.endpoint ? {
          ...node.endpoint,
          name: localizeDemoProxyName(node.endpoint.name, id, locale),
          metadata: node.endpoint.metadata ? { ...node.endpoint.metadata, sourceName: node.endpoint.metadata.sourceName ? localizeKnownSystemText(node.endpoint.metadata.sourceName, locale) : node.endpoint.metadata.sourceName } : node.endpoint.metadata,
        } : undefined,
      })),
    },
  } : snapshot])) as Record<string, SubscriptionSnapshot>
}

export function isBuiltInDemoFilter(nodeId: string, data: BlockNodeData) {
  if (!['hk-filter', 'us-filter'].includes(nodeId)) return false
  const values = [...(data.include ?? []), ...(data.exclude ?? [])]
  return values.every((value) => ['official', 'remaining', 'multiplier', '官网', '剩余', '倍率'].includes(value))
}

function normalizeDemoFilterData(projectId: string, nodeId: string, data: BlockNodeData) {
  if (projectId !== 'proxyflow-demo' || !isBuiltInDemoFilter(nodeId, data)) return data
  return {
    ...data,
    systemFilterKeywords: true,
    include: data.include?.map((value) => localizeKnownSystemText(value, 'en-US')),
    exclude: data.exclude?.map((value) => localizeKnownSystemText(value, 'en-US')),
  }
}

function localizeDemoProxyName(name: string, sourceId: string, locale: Locale) {
  if (sourceId === 'hkt-subscription') return name.replace(/^🇭🇰\s+(?:香港|HK)(?=\s|$)/u, locale === 'zh-CN' ? '🇭🇰 香港' : '🇭🇰 HK')
  if (sourceId === 'us-subscription') return name.replace(/^🇺🇸\s+(?:美国|US)(?=\s|$)/u, locale === 'zh-CN' ? '🇺🇸 美国' : '🇺🇸 US')
  return name
}

export function localizeKnownSystemText(value: string, locale: Locale): string {
  const exactKey = systemTextLookup.get(value)
  if (exactKey) return translate(locale, exactKey)

  const chain = value.match(/^(?:代理链|Proxy chain) · (\d+) (?:Hops|hops|跳)$/i)
  if (chain) return translate(locale, 'demo.chain.dynamicSubtitle', { count: chain[1] })
  const subscription = value.match(/^(\d+) detected · (\d+) usable$/i)
  if (subscription) return translate(locale, 'demo.subscription.dynamicSubtitle', { detected: subscription[1], ready: subscription[2] })
  const zhSubscription = value.match(/^检测到 (\d+) 个 · 可用 (\d+) 个$/u)
  if (zhSubscription) return translate(locale, 'demo.subscription.dynamicSubtitle', { detected: zhSubscription[1], ready: zhSubscription[2] })
  const filterRuntime = value.match(/^(?:匹配|Matched) (\d+) \/ (\d+) (?:个节点|proxies)$/i)
  if (filterRuntime) return translate(locale, 'demo.filter.dynamicSubtitle', { matched: filterRuntime[1], total: filterRuntime[2] })
  const strategyRuntime = value.match(/^(?:当前|Current) (.+?) · (\d+) (?:ms|毫秒)$/i)
  if (strategyRuntime) return translate(locale, 'demo.auto.currentSubtitle', { proxy: strategyRuntime[1], latency: strategyRuntime[2] })
  const output = value.match(/^(.*?) (?:Output|输出)$/i)
  if (output) return translate(locale, 'node.outputTitle', { target: output[1] })
  const schema = value.match(/(?:Project Schema|项目结构) V(\d+)/i)
  if (schema && (value.includes('无法读取') || value.toLowerCase().includes('cannot be read'))) return translate(locale, 'recovery.schemaUnreadable', { version: schema[1] })
  const copy = value.match(/^(.*?)(?: 副本| copy)$/i)
  if (copy) return translate(locale, 'toast.duplicateSuffix', { name: localizeKnownSystemText(copy[1], locale) })
  return value
}

export function localizeDiagnosticMessage(code: string, message: string, locale: Locale) {
  if (code === 'SUBSCRIPTION_HTTP_ERROR' && /^HTTP \d{3}$/.test(message)) return message
  const copy = issueCopy[code]?.[locale]
  if (copy) return copy
  const containsCjk = /[\u3400-\u9fff]/u.test(message)
  if ((locale === 'zh-CN' && containsCjk) || (locale === 'en-US' && !containsCjk)) return message
  return translate(locale, 'issue.generic', { code })
}

export function regionLabel(code: string, locale: Locale) {
  return regionLabelForLocale(code, locale)
}

export function formatDateTime(value: string | Date, locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options).format(typeof value === 'string' ? new Date(value) : value)
}

function interpolate(template: string, values: TranslationValues) {
  return template.replaceAll(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? `{${key}}`))
}

const systemKeys: MessageKey[] = [
  'project.demoName', 'project.blankName',
  'demo.subscription.hkt', 'demo.subscription.us', 'demo.subscription.subtitle',
  'demo.filter.hk', 'demo.filter.us', 'demo.filter.hkSubtitle', 'demo.filter.usSubtitle',
  'demo.auto.hk', 'demo.auto.us', 'demo.auto.subtitle',
  'demo.chain.title', 'demo.chain.subtitle', 'demo.ai.title', 'demo.ai.subtitle',
  'demo.streaming.title', 'demo.streaming.subtitle', 'demo.telegram.subtitle',
  'demo.china.title', 'demo.china.subtitle', 'block.dns.title', 'demo.dns.subtitle',
  'block.final.title', 'demo.final.subtitle', 'demo.output.subtitle',
  'demo.blank.finalSubtitle', 'demo.blank.outputSubtitle', 'demo.strategy.auto', 'demo.strategy.fallback',
  'demo.filter.dynamicSubtitle', 'demo.auto.currentSubtitle',
  'demo.subscription.notParsed', 'demo.subscription.startup',
  'demo.filter.keywordOfficial', 'demo.filter.keywordRemaining', 'demo.filter.keywordMultiplier',
  'demo.service.chinaMainland',
  'recovery.unreadable', 'recovery.resetDemo', 'recovery.createdBlank',
  'recovery.legacyNoStrategy', 'recovery.migratedFinal', 'recovery.migratedV2',
  ...([
    'subscription', 'manual-proxy', 'provider', 'import-config', 'filter', 'rename', 'sort', 'deduplicate', 'merge', 'limit',
    'manual-select', 'auto-select', 'fallback', 'load-balance', 'fixed-proxy', 'proxy-chain', 'routing-group', 'service-rule',
    'custom-rule', 'final', 'dns', 'output',
  ] as BlockType[]).flatMap((type) => [blockTitleKey(type), blockDescriptionKey(type)]),
]

const systemTextLookup = new Map<string, MessageKey>()
for (const key of systemKeys) {
  systemTextLookup.set(enUS[key], key)
  systemTextLookup.set(zhCN[key], key)
}
systemTextLookup.set('旧项目的 Final 指向 Output，且没有可恢复的策略。原始数据尚未覆盖。', 'recovery.legacyNoStrategy')
systemTextLookup.set('已将旧版 Final → Output 安全迁移到可用策略，并升级为 Project Schema V2。', 'recovery.migratedFinal')
systemTextLookup.set('项目已升级为 Project Schema V2。', 'recovery.migratedV2')
systemTextLookup.set('China Mainland', 'demo.service.chinaMainland')
// Exact legacy demo copy from pre-i18n projects. Keep this allowlist narrow so user-authored names remain untouched.
systemTextLookup.set('基础 DNS · redir-host', 'demo.dns.subtitle')
systemTextLookup.set('其余流量 · Default Proxy', 'demo.final.subtitle')
systemTextLookup.set('真实编译 · MVP', 'demo.output.subtitle')
systemTextLookup.set('3 个服务 · US via HK', 'demo.ai.subtitle')
systemTextLookup.set('3 个服务 · US Auto', 'demo.streaming.subtitle')
systemTextLookup.set('Social · HK Auto', 'demo.telegram.subtitle')
systemTextLookup.set('China Mainland · DIRECT', 'demo.china.subtitle')
systemTextLookup.set('备用故障切换', 'block.fallback.title')
systemTextLookup.set('Mock Fallback · Standby', 'block.fallback.description')
systemTextLookup.set('US 订阅源', 'demo.subscription.us')
systemTextLookup.set('AI 服务', 'demo.ai.title')
systemTextLookup.set('DNS 配置', 'block.dns.title')

const issueCopy: Record<string, Record<Locale, string>> = {
  SUBSCRIPTION_INVALID_URL: { 'en-US': 'Subscription URL must use HTTP or HTTPS.', 'zh-CN': '订阅地址必须使用 HTTP 或 HTTPS。' },
  SUBSCRIPTION_HTTP_ERROR: { 'en-US': 'The subscription server returned an HTTP error.', 'zh-CN': '订阅服务器返回了 HTTP 错误。' },
  SUBSCRIPTION_CORS_BLOCKED: { 'en-US': 'The browser blocked this cross-origin request. Use Paste Content, Local File, or a URL that supports CORS.', 'zh-CN': '浏览器阻止了此跨域请求。请使用粘贴内容、本地文件或支持 CORS 的订阅地址。' },
  SUBSCRIPTION_NETWORK_ERROR: { 'en-US': 'The subscription request failed because of a network error.', 'zh-CN': '订阅请求因网络错误而失败。' },
  SUBSCRIPTION_TIMEOUT: { 'en-US': 'The subscription request timed out.', 'zh-CN': '订阅请求超时。' },
  SUBSCRIPTION_TOO_LARGE: { 'en-US': 'The subscription exceeds the browser size limit.', 'zh-CN': '订阅内容超过浏览器大小限制。' },
  SUBSCRIPTION_UNSUPPORTED_FORMAT: { 'en-US': 'The subscription format is not supported.', 'zh-CN': '不支持该订阅格式。' },
  SUBSCRIPTION_PARSE_FAILED: { 'en-US': 'The subscription could not be parsed.', 'zh-CN': '订阅内容无法解析。' },
  SUBSCRIPTION_NO_USABLE_NODES: { 'en-US': 'The subscription contains no Ready nodes; the previous snapshot was retained.', 'zh-CN': '订阅中没有可用节点，已保留之前的快照。' },
  SUBSCRIPTION_CACHE_READ_FAILED: { 'en-US': 'The locally cached subscription snapshot could not be read.', 'zh-CN': '无法读取浏览器中的订阅缓存快照。' },
  SUBSCRIPTION_CACHE_WRITE_FAILED: { 'en-US': 'The active snapshot could not be saved to browser cache.', 'zh-CN': '活动快照无法写入浏览器缓存。' },
  SUBSCRIPTION_SNAPSHOT_COMMIT_FAILED: { 'en-US': 'The refreshed snapshot could not be committed.', 'zh-CN': '刷新后的快照无法提交。' },
  SUBSCRIPTION_RUNTIME_INTERNAL_ERROR: { 'en-US': 'Subscription refresh failed because of an internal runtime error.', 'zh-CN': '订阅刷新因内部运行时错误而失败。' },
  UNSUPPORTED_FORMAT: { 'en-US': 'The subscription format could not be recognized.', 'zh-CN': '无法识别订阅格式。' },
  PARSE_FAILED: { 'en-US': 'The subscription content is empty or malformed.', 'zh-CN': '订阅内容为空或格式损坏。' },
  ONLY_PROXY_SECTION_IMPORTED: { 'en-US': 'Only proxy definitions were imported; client control sections were ignored.', 'zh-CN': '仅导入代理定义，客户端控制配置段已忽略。' },
  PROXY_LINE_INVALID: { 'en-US': 'This proxy line is missing a valid server or port.', 'zh-CN': '该代理行缺少有效的服务器或端口。' },
  PROXY_NODE_INVALID: { 'en-US': 'This proxy entry is missing required connection fields.', 'zh-CN': '该代理条目缺少必要的连接字段。' },
  PROXY_PROTOCOL_UNSUPPORTED: { 'en-US': 'This proxy protocol is not supported by ProxyFlow.', 'zh-CN': 'ProxyFlow 尚不支持该代理协议。' },
  UI_SOURCE_DISCONNECTED: { 'en-US': 'This source is not connected to the processing flow.', 'zh-CN': '该数据源尚未连接到处理流程。' },
  UI_STRATEGY_SOURCE_MISSING: { 'en-US': 'This strategy has no proxy source.', 'zh-CN': '该策略尚未连接节点来源。' },
  UI_CHAIN_EMPTY: { 'en-US': 'A proxy chain needs at least one hop.', 'zh-CN': '代理链至少需要一跳。' },
  UI_ROUTE_TARGET_MISSING: { 'en-US': 'This routing rule has no target strategy.', 'zh-CN': '该分流规则尚未选择目标策略。' },
  UI_ROUTE_MATCHER_MISSING: { 'en-US': 'This custom rule has no matcher value.', 'zh-CN': '该自定义规则尚未填写匹配值。' },
  UI_ROUTE_PORT_INVALID: { 'en-US': 'Port must be between 1 and 65535.', 'zh-CN': '端口必须在 1 到 65535 之间。' },
  ROUTE_MATCHER_INVALID: { 'en-US': 'The route matcher value is invalid.', 'zh-CN': '分流匹配值无效。' },
  ROUTE_DOMAIN_INVALID: { 'en-US': 'The domain matcher must be a hostname without a URL, path, port, or wildcard.', 'zh-CN': '域名匹配器必须是主机名，不能包含 URL、路径、端口或通配符。' },
  ROUTE_CIDR_INVALID: { 'en-US': 'The CIDR matcher is invalid or uses the wrong IP family.', 'zh-CN': 'CIDR 匹配器无效，或使用了错误的 IP 地址族。' },
  ROUTE_PORT_INVALID: { 'en-US': 'The route port must be between 1 and 65535.', 'zh-CN': '分流端口必须在 1 到 65535 之间。' },
  ROUTE_ASN_INVALID: { 'en-US': 'ASN must be a positive 32-bit number.', 'zh-CN': 'ASN 必须是正的 32 位数字。' },
  ROUTE_GEO_INVALID: { 'en-US': 'The GeoIP or GeoSite matcher value is invalid.', 'zh-CN': 'GeoIP 或 GeoSite 匹配值无效。' },
  ROUTE_RULE_SET_NOT_FOUND: { 'en-US': 'The referenced rule set does not exist.', 'zh-CN': '引用的规则集不存在。' },
  ROUTE_RULE_SET_AMBIGUOUS: { 'en-US': 'The referenced rule set ID is defined more than once.', 'zh-CN': '引用的规则集 ID 定义了多个来源。' },
  MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED: { 'en-US': 'This rule set source cannot be represented by a Mihomo rule provider.', 'zh-CN': '该规则集来源无法表示为 Mihomo 规则提供方。' },
  MIHOMO_PROFILE_INVALID: { 'en-US': 'The Mihomo output profile contains an invalid setting.', 'zh-CN': 'Mihomo 输出配置包含无效设置。' },
  MIHOMO_MIXED_PORT_INVALID: { 'en-US': 'The Mihomo mixed port must be an integer between 1 and 65535.', 'zh-CN': 'Mihomo 混合代理端口必须是 1 到 65535 之间的整数。' },
  MIHOMO_TUN_DNS_REQUIRED: { 'en-US': 'Desktop TUN requires an enabled DNS node in the Project.', 'zh-CN': '桌面 TUN 需要项目中存在已启用的域名解析节点。' },
  MIHOMO_TUN_FAKE_IP_REQUIRED: { 'en-US': 'Desktop TUN requires Fake-IP DNS mode.', 'zh-CN': '桌面 TUN 必须使用 Fake-IP 域名解析模式。' },
  SINGBOX_INVALID_RULESET: { 'en-US': 'This rule set source is not compatible with sing-box.', 'zh-CN': '该规则集来源与 sing-box 不兼容。' },
  SINGBOX_RULE_SET_NOT_FOUND: { 'en-US': 'The referenced rule set does not exist in the project.', 'zh-CN': '项目中不存在引用的规则集。' },
  UI_FINAL_TARGET_MISSING: { 'en-US': 'Final must connect to an outbound target.', 'zh-CN': '最终规则必须连接到出站目标。' },
  UI_OUTPUT_CLIENT_MISSING: { 'en-US': 'Select a target client.', 'zh-CN': '请选择目标客户端。' },
  PROXY_PARAMS_CONFLICT: { 'en-US': 'Conflicting connection-critical parameters make this endpoint ambiguous.', 'zh-CN': '连接关键参数相互冲突，无法确定该节点的唯一语义。' },
  PROXY_PARAMS_UNRECOGNIZED: { 'en-US': 'This endpoint contains unrecognized parameters.', 'zh-CN': '该节点包含未识别参数。' },
  PROXY_VARIANT_PARTIAL: { 'en-US': 'This endpoint contains semantics that cannot be lowered reliably.', 'zh-CN': '该节点包含当前无法可靠转换的语义。' },
  PROXY_VARIANT_EXCLUDED: { 'en-US': 'An incompatible endpoint was excluded from target output.', 'zh-CN': '不兼容节点已从目标输出中排除。' },
  PROXY_SECURITY_UNSUPPORTED: { 'en-US': 'The endpoint uses an unsupported security value and was blocked.', 'zh-CN': '该节点使用不支持的安全参数，已阻止编译。' },
  PROXY_SECURITY_CRITICAL_UNSUPPORTED: { 'en-US': 'Security-critical semantics cannot be represented safely.', 'zh-CN': '安全关键语义无法安全表达。' },
  PROXY_VLESS_REALITY_SECURITY_CONFLICT: { 'en-US': 'VLESS security settings conflict with Reality intent.', 'zh-CN': 'VLESS 安全设置与 Reality 语义冲突。' },
  PROXY_VLESS_VISION_TLS_REQUIRED: { 'en-US': 'VLESS Vision requires TLS security.', 'zh-CN': 'VLESS Vision 必须启用 TLS 安全。' },
  PROXY_REALITY_TLS_REQUIRED: { 'en-US': 'Reality intent requires TLS security.', 'zh-CN': 'Reality 语义必须启用 TLS 安全。' },
  PROXY_TLS_DISABLED_WITH_SECURITY_FIELDS: { 'en-US': 'TLS is disabled while TLS-only security fields remain set.', 'zh-CN': 'TLS 已禁用，但仍设置了仅适用于 TLS 的安全字段。' },
  PROXY_TLS_REQUIRED: { 'en-US': 'This protocol requires TLS.', 'zh-CN': '该协议必须启用 TLS。' },
  PROXY_WS_EARLY_DATA_INVALID: { 'en-US': 'The WebSocket early-data value is invalid.', 'zh-CN': 'WebSocket 早期数据参数无效。' },
  PROXY_HYSTERIA2_BANDWIDTH_INVALID: { 'en-US': 'The explicit Hysteria2 bandwidth value is invalid.', 'zh-CN': '显式 Hysteria2 带宽参数无效。' },
  PROXY_HYSTERIA2_HOP_INTERVAL_INVALID: { 'en-US': 'The Hysteria2 hop interval is invalid.', 'zh-CN': 'Hysteria2 跳跃间隔无效。' },
  PROXY_HYSTERIA2_PORT_HOPPING_INVALID: { 'en-US': 'The Hysteria2 port-hopping definition is invalid.', 'zh-CN': 'Hysteria2 端口跳跃定义无效。' },
  PROXY_ANYTLS_CRITICAL_PARAMETER_UNSUPPORTED: { 'en-US': 'The AnyTLS endpoint contains unsupported connection-critical semantics and was blocked.', 'zh-CN': 'AnyTLS 节点包含不支持的连接关键语义，已阻止编译。' },
  PROXY_ANYTLS_IDLE_SESSION_INVALID: { 'en-US': 'The AnyTLS idle-session settings are invalid.', 'zh-CN': 'AnyTLS 空闲会话参数无效。' },
  PROXY_ANYTLS_UDP_INVALID: { 'en-US': 'The AnyTLS UDP value is invalid.', 'zh-CN': 'AnyTLS UDP 参数无效。' },
  PROXY_VMESS_TLS_UNSUPPORTED: { 'en-US': 'The VMess TLS value is unsupported and plaintext fallback was blocked.', 'zh-CN': 'VMess TLS 参数不受支持，已阻止回退到明文连接。' },
  PROXY_VMESS_ALTER_ID_INVALID: { 'en-US': 'The VMess alter ID is invalid.', 'zh-CN': 'VMess 备用标识无效。' },
  PROXY_VMESS_TCP_HEADER_UNSUPPORTED: { 'en-US': 'The VMess TCP header intent cannot be represented losslessly.', 'zh-CN': 'VMess TCP 请求头语义无法无损表达。' },
  SINGBOX_TRANSPORT_XHTTP_UNSUPPORTED: { 'en-US': 'sing-box 1.13.14 does not support XHTTP transport.', 'zh-CN': 'sing-box 1.13.14 不支持 XHTTP 传输。' },
  SINGBOX_TRANSPORT_H2_REQUIRES_TLS: { 'en-US': 'sing-box H2 transport requires TLS to preserve HTTP/2 semantics.', 'zh-CN': 'sing-box 的 H2 传输必须启用 TLS 才能保持 HTTP/2 语义。' },
  SINGBOX_TRANSPORT_HTTP_TLS_VARIANT_UNSUPPORTED: { 'en-US': 'sing-box cannot preserve HTTP/1.1 transport with TLS for this endpoint.', 'zh-CN': 'sing-box 无法为该节点保持启用 TLS 的 HTTP/1.1 传输语义。' },
  SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED: { 'en-US': 'The selected sing-box baseline has no equivalent fallback outbound.', 'zh-CN': '当前 sing-box 基线没有等价的故障切换出站。' },
  SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED: { 'en-US': 'This rule source is not available in a sing-box-compatible format.', 'zh-CN': '该规则来源没有兼容 sing-box 的格式。' },
  SINGBOX_ANYTLS_UDP_DISABLE_UNSUPPORTED: { 'en-US': 'sing-box 1.13.14 cannot preserve an explicit AnyTLS UDP-disable intent.', 'zh-CN': 'sing-box 1.13.14 无法保持显式禁用 AnyTLS UDP 的语义。' },
  MIHOMO_PROXY_VARIANT_UNSUPPORTED: { 'en-US': 'Mihomo cannot represent this endpoint without losing semantics.', 'zh-CN': 'Mihomo 无法在不丢失语义的情况下表达该节点。' },
  MIHOMO_PROXY_VARIANT_EXCLUDED: { 'en-US': 'An incompatible endpoint was excluded from Mihomo output.', 'zh-CN': '不兼容节点已从 Mihomo 输出中排除。' },
  SOURCE_UNAVAILABLE: { 'en-US': 'The source is unavailable and downstream processing was blocked.', 'zh-CN': '数据源不可用，后续处理已阻止。' },
  TRANSFORM_UNAVAILABLE: { 'en-US': 'The transform is unavailable because its input failed.', 'zh-CN': '输入失败，因此该处理步骤不可用。' },
  TRANSFORM_MISSING_INPUT: { 'en-US': 'This processing node has no valid proxy-set input.', 'zh-CN': '该处理节点没有有效的代理节点集输入。' },
  FILTER_INVALID_REGEX: { 'en-US': 'The filter regular expression is invalid. Processing was blocked.', 'zh-CN': '筛选正则表达式无效，已阻止该处理步骤。' },
  INVALID_RENAME_REGEX: { 'en-US': 'The rename regular expression is invalid. Processing was blocked.', 'zh-CN': '重命名正则表达式无效，已阻止该处理步骤。' },
  LIMIT_INVALID: { 'en-US': 'Limit must be a positive integer.', 'zh-CN': '保留数量必须是大于 0 的整数。' },
  IR_PROXY_REALITY_PROTOCOL_UNSUPPORTED: { 'en-US': 'Reality is not valid for this proxy protocol.', 'zh-CN': '该代理协议不支持 Reality 语义。' },
  EMPTY_RESULT: { 'en-US': 'Processing completed successfully, but the result is empty.', 'zh-CN': '处理已成功完成，但结果为空。' },
}

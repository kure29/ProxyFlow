# Mihomo Compiler MVP

ProxyFlow V0.3 的真实编译链路：

```text
ProxyFlowIR
    ↓
IR Validation
    ↓
Mihomo Compatibility Check
    ↓
Mihomo Intermediate Model
    ↓
YAML Serializer
```

Compiler 是纯函数：不读取 Zustand、LocalStorage 或 DOM，不下载订阅和规则，也不访问网络。Mihomo 专用字段全部位于 `src/targets/mihomo`，Universal IR 保持客户端无关。

实现依据 MetaCubeX 官方文档：

- [Proxy Providers](https://wiki.metacubex.one/en/config/proxy-providers/)
- [Proxy Groups](https://wiki.metacubex.one/en/config/proxy-groups/)
- [Routing Rules](https://wiki.metacubex.one/en/config/rules/)
- [Rule Providers](https://wiki.metacubex.one/en/config/rule-providers/)
- [DNS](https://wiki.metacubex.one/en/config/dns/)
- [dialer-proxy](https://wiki.metacubex.one/en/config/proxies/dialer-proxy/)

## Mapping table

| Universal feature | Mihomo mapping | Compatibility |
| --- | --- | --- |
| Subscription / Provider | HTTP `proxy-providers` | Supported |
| Filter | group `filter` / `exclude-filter` | Supported；多个不同 filter scope 合并时 Error |
| Rename | Provider `override.proxy-name` | Supported when pattern/replacement exist |
| Sort / Deduplicate / Limit | 无远程 Provider 等价能力 | Error |
| Merge | 一个 group 的多个 `use` providers | Supported |
| Select | `type: select` | Supported |
| Auto Select | `type: url-test` | Supported |
| Fallback | `type: fallback` | Supported |
| Load Balance | `type: load-balance` | Supported；`consistent-hash` → `consistent-hashing` |
| Manual HTTP / SOCKS5 | explicit `proxies` entry | Supported |
| Fixed explicit proxy | one-member `select` group | Supported |
| Service | Remote `rule-providers` + `RULE-SET` | Supported when a safe source exists |
| Domain / Suffix / Keyword | `DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` | Supported |
| IPv4 / IPv6 / ASN | `IP-CIDR` / `IP-CIDR6` / `IP-ASN` | Supported |
| GeoIP / GeoSite | `GEOIP` / `GEOSITE` | Supported |
| DIRECT / REJECT / Final | built-in target / `MATCH` | Supported |
| DNS | `enable`、`redir-host`、bootstrap、nameserver | MVP subset |
| Chain | Provider clone + `override.dialer-proxy` | Supported with protocol/UDP Warning |

## Defaults

所有默认值集中于 `defaults.ts`：

- `mixed-port: 7890`
- `mode: rule`
- `allow-lan: false`
- Provider update interval: 21600 seconds
- Rule Provider update interval: 86400 seconds
- Health check: Google `generate_204`, 300 seconds
- DNS: `redir-host`、`223.5.5.5` bootstrap、Cloudflare DoH fallback

## Rule sources

Demo Service Catalog 引用 `blackmatrix7/ios_rule_script` 的公开 Clash YAML URL，使用 `http + classical + yaml` Rule Provider。ProxyFlow 不复制、打包或在测试中下载第三方规则。China 内置 Service 生成 `GEOSITE,cn` 与 `GEOIP,CN`。

只允许 `http:` 与 `https:` Remote URL。`file:`、`data:`、`javascript:` 和无效 URL 会产生 compile error，输出内容为空。

## Proxy Chain

官方文档已经弃用 `relay` group，且 group 本身不支持 `dialer-proxy`。V0.3 将后一跳的 Provider 克隆为派生 Provider，并设置：

```yaml
override:
  dialer-proxy: Previous Hop Group
```

二跳与三跳按 Universal IR `hops` 数组顺序逐层 lowering。每一跳必须是仅由 Provider 驱动的 Select、Auto Select、Fallback 或 Load Balance。实际 UDP 和协议兼容性取决于订阅节点，因此始终返回 warning，不会宣称完全等价。

## Failure behavior

任何 Graph、IR 或 Mihomo compatibility error 都会停止目标编译：

- `success: false`
- `content: ''`
- `mock: false`

Preview 不会回退到示例 YAML。只有真实编译成功时才能复制和下载。

## Known limitations

- 不解析 Subscription 内容
- 不生成 VMess、VLESS、Trojan、SS 等协议节点
- 不支持 Manual Proxy 与 Imported Config source
- 不执行网络请求或验证 Remote Rule 可达性
- 缺少 pattern/replacement 的 Rename 是 no-op warning；Sort、Deduplicate、Limit 阻止编译
- DNS 只覆盖当前 Universal IR 的最小字段
- Chain 不保证所有 UDP/传输协议组合均可工作
- 只实现 Mihomo，不包含其他 Target Compiler

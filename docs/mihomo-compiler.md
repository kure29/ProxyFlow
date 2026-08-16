# Mihomo Compiler MVP

ProxyFlow V0.5 的真实编译链路：

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

Compiler 是纯函数：不读取 Zustand、LocalStorage 或 DOM，不下载订阅和规则，也不访问网络。浏览器 Source Fetcher 与 Subscription Parser 在进入 Graph Compiler 前完成工作；Mihomo 专用字段全部位于 `src/targets/mihomo`，Universal IR 保持客户端无关。

实现依据 MetaCubeX 官方文档：

- [Proxy Providers](https://wiki.metacubex.one/en/config/proxy-providers/)
- [Proxy Groups](https://wiki.metacubex.one/en/config/proxy-groups/)
- [Routing Rules](https://wiki.metacubex.one/en/config/rules/)
- [Rule Providers](https://wiki.metacubex.one/en/config/rule-providers/)
- [DNS](https://wiki.metacubex.one/en/config/dns/)
- [dialer-proxy](https://wiki.metacubex.one/en/config/proxies/dialer-proxy/)
- [HTTP / SOCKS proxies](https://wiki.metacubex.one/en/config/proxies/)
- [Shadowsocks](https://wiki.metacubex.one/en/config/proxies/ss/)
- [Trojan](https://wiki.metacubex.one/en/config/proxies/trojan/)
- [VMess](https://wiki.metacubex.one/en/config/proxies/vmess/)
- [VLESS](https://wiki.metacubex.one/en/config/proxies/vless/)

## Mapping table

| Universal feature | Mihomo mapping | Compatibility |
| --- | --- | --- |
| Unresolved URL Subscription / Provider | HTTP `proxy-providers` | Supported when consumed directly |
| Materialized Subscription | explicit `proxies` | Supported |
| Filter | local ProxySet filtering before target lowering | Supported for materialized input |
| Rename | local regex replacement before target lowering | Supported for materialized input |
| Sort / Deduplicate / Limit | locally materialized deterministic list | Supported |
| Merge | locally materialized ordered union | Supported；不隐式去重 |
| Select | `type: select` | Supported |
| Auto Select | `type: url-test` | Supported |
| Fallback | `type: fallback` | Supported |
| Load Balance | `type: load-balance` | Supported；`consistent-hash` → `consistent-hashing` |
| HTTP / SOCKS5 / SS / Trojan / VMess / VLESS | explicit `proxies` entry | Supported basic subset |
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

二跳与三跳按 Universal IR `hops` 数组顺序逐层 lowering。远程 Provider chain 使用派生 Provider；materialized endpoint chain 使用目标层 `dialer-proxy`。实际 UDP 和 transport 兼容性取决于节点组合，因此不会宣称所有扩展协议都完全等价。

## Failure behavior

任何 Graph、IR 或 Mihomo compatibility error 都会停止目标编译：

- `success: false`
- `content: ''`
- `mock: false`

Preview 不会回退到示例 YAML。只有真实编译成功时才能复制和下载。

## Known limitations

- Target Compiler 本身不解析 Subscription；它只消费已经 materialized 的 IR，或保留无需本地处理的 remote provider URL
- 支持六种基础协议，不支持 Reality、Vision、复杂 XTLS 等 Partial variant
- Imported Config source 仍未实现
- 不执行网络请求或验证 Remote Rule 可达性
- Latency Sort 需要真实测速，因此返回 `SPEED_TEST_REQUIRED`
- DNS 只覆盖当前 Universal IR 的最小字段
- Chain 不保证所有 UDP/传输协议组合均可工作
- Surge、Loon、Quantumult X 等其他 Target 尚未实现；sing-box 由独立 Compiler 处理

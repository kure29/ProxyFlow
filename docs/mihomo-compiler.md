# Mihomo Compiler

ProxyFlow 1.1 的真实编译链路：

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
- [Global settings](https://wiki.metacubex.one/en/config/general/)
- [Tun](https://wiki.metacubex.one/en/config/inbound/tun/)
- [Domain sniffing](https://wiki.metacubex.one/en/config/sniff/)
- [dialer-proxy](https://wiki.metacubex.one/en/config/proxies/dialer-proxy/)
- [HTTP / SOCKS proxies](https://wiki.metacubex.one/en/config/proxies/)
- [Shadowsocks](https://wiki.metacubex.one/en/config/proxies/ss/)
- [Trojan](https://wiki.metacubex.one/en/config/proxies/trojan/)
- [VMess](https://wiki.metacubex.one/en/config/proxies/vmess/)
- [VLESS](https://wiki.metacubex.one/en/config/proxies/vless/)
- [Transport](https://wiki.metacubex.one/en/config/proxies/transport/)
- [Hysteria2](https://wiki.metacubex.one/en/config/proxies/hysteria2/)
- [TUIC](https://wiki.metacubex.one/en/config/proxies/tuic/)
- [AnyTLS](https://wiki.metacubex.one/en/config/proxies/anytls/)

## Mapping table

| Universal feature | Mihomo mapping | Compatibility |
| --- | --- | --- |
| URL Subscription / Auto or Remote | HTTP `proxy-providers` | Supported only with current snapshot, direct lineage, and portable Request Profile |
| URL Subscription / Materialized | explicit `proxies` | Supported |
| Filter | local ProxySet filtering before target lowering | Supported for materialized input |
| Rename | local regex replacement before target lowering | Supported for materialized input |
| Sort / Deduplicate / Limit | locally materialized deterministic list | Supported |
| Merge | locally materialized ordered union | Supported；不隐式去重 |
| Select | `type: select` | Supported |
| Auto Select | `type: url-test` | Supported |
| Fallback | `type: fallback` | Supported |
| Load Balance | `type: load-balance` | Supported；`consistent-hash` → `consistent-hashing` |
| HTTP / SOCKS5 / SS / Trojan / VMess / VLESS | explicit `proxies` entry | Supported basic subset |
| Reality / Vision | `reality-opts`、`client-fingerprint`、`flow` | Supported |
| WS / HTTP / H2 / gRPC / HTTPUpgrade / XHTTP | target transport opts | Supported |
| Hysteria2 / TUIC v5 | explicit `hysteria2` / `tuic` entry | Supported normalized subset |
| AnyTLS | explicit `anytls` entry | Supported normalized subset |
| AnyTLS TLS / session | `sni`、`skip-cert-verify`、`client-fingerprint`、`alpn`、idle-session fields | Supported |
| AnyTLS + Reality / unknown critical fields | — | Partial / Error；不生成 fallback |
| Hysteria2 port hopping | `ports: 443,5000-6000` | Supported；由结构化 IR 序列化 |
| Hysteria2 fixed / random hop interval | `hop-interval: 30` / `15-30` | Supported |
| TUIC allow-insecure / disable-SNI | `skip-cert-verify` / `disable-sni` | Supported |
| Hysteria2 pin / ECH、Clash certificate fingerprint | — | Partial；由 target compatibility 判断，不静默降级 |
| non-TUIC disable-SNI | — | Error；`MIHOMO_TLS_DISABLE_SNI_UNSUPPORTED` |
| Hysteria2 / TUIC client fingerprint | — | Error；`MIHOMO_QUIC_TLS_FINGERPRINT_UNSUPPORTED` |
| HTTP proxy client fingerprint | — | Error；不误映射为 certificate `fingerprint` |
| Fixed explicit proxy | one-member `select` group | Supported |
| Service | Remote `rule-providers` + `RULE-SET` | Supported when a safe source exists |
| Domain / Suffix / Keyword | `DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` | Supported |
| IPv4 / IPv6 / ASN | `IP-CIDR` / `IP-CIDR6` / `IP-ASN` | Supported |
| GeoIP / GeoSite | `GEOIP` / `GEOSITE` | Supported |
| DIRECT / REJECT / Final | built-in target / `MATCH` | Supported |
| DNS | `enable`、`redir-host` / `fake-ip`、bootstrap、nameserver、IPv6 | Supported subset; Fake-IP is coordinated with Desktop TUN |
| Mihomo Output Profile | `mixed-port`、`allow-lan`、`ipv6`、`mode`、`unified-delay`、`tcp-concurrent`、`profile` | Supported target-specific settings |
| Desktop TUN preset | `tun.enable`、`stack`、`auto-route`、`auto-detect-interface`、DNS hijack、`strict-route` | Supported when an enabled DNS node exists; platform-specific fields omitted |
| Domain sniffer | HTTP/TLS/QUIC port maps, DNS mapping, pure-IP parsing | Supported opt-in; no raw schema editor |
| Chain | Provider clone + `override.dialer-proxy` | Supported with protocol/UDP Warning |

## Defaults

编译常量位于 `defaults.ts`，Output Profile 默认值位于 `profile.ts`：

- `mixed-port: 7890`
- `mode: rule`
- `allow-lan: false`
- `ipv6: true`
- `unified-delay: true`
- `tcp-concurrent: true`
- `profile.store-selected: true`
- Local Proxy preset with `dns.enhanced-mode: redir-host`
- Provider update interval: 21600 seconds
- Rule Provider update interval: 86400 seconds
- Health check: Google `generate_204`, 300 seconds
- DNS: `redir-host`、`223.5.5.5` bootstrap、Cloudflare DoH fallback

## Rule sources

Demo Service Catalog 引用 `kure29/proxyflow-rules` 的第一方 Mihomo YAML URL，使用 `http + classical + yaml` Rule Provider。ProxyFlow Runtime 和测试不下载远程规则。China 内置 Service 仍生成 `GEOSITE,cn` 与 `GEOIP,CN`。

只允许 `http:` 与 `https:` Remote URL。`file:`、`data:`、`javascript:` 和无效 URL 会产生 compile error，输出内容为空。

## Proxy Chain

官方文档已经弃用 `relay` group，且 group 本身不支持 `dialer-proxy`。当前 lowering 将后一跳的 Provider 克隆为派生 Provider，并设置：

```yaml
override:
  dialer-proxy: Previous Hop Group
```

二跳与三跳按 Universal IR `hops` 数组顺序逐层 lowering。Universal Remote Subscription 在 Proxy Chain hop 中保守 materialize；已有 legacy Provider source 仍可使用派生 Provider。materialized endpoint chain 使用目标层 `dialer-proxy`。实际 UDP 和 transport 兼容性取决于节点组合，因此不会宣称所有扩展协议都完全等价。

## Failure behavior

任何 Graph、IR 或 Mihomo compatibility error 都会停止目标编译：

- `success: false`
- `content: ''`
- `mock: false`

Preview 不会回退到示例 YAML。只有真实编译成功时才能复制和下载。

## Known limitations

- Target Compiler 本身不解析 Subscription；它消费同时包含 current snapshot 与 target-neutral remote descriptor 的 IR，并服从统一 Remote Source Planner
- Native adapter 仅为 Auto / Mihomo Request Profile 生成 allowlisted `User-Agent: Clash.Meta` header；不支持任意 header 注入
- Provider key 由稳定 Source ID 生成并 dedupe，不随显示名称变化
- 支持基础协议、Reality/Vision、结构化 Hysteria2 port hopping、TUIC security flags 与现代 transport；未知 security/flow、pin/ECH、证书指纹或缺失必需字段仍为 Partial
- Universal endpoint semantic error 会在 `validateIR()` 阶段停止；合法但 Mihomo schema 无法表达的 non-TUIC disable-SNI 或 QUIC client fingerprint 会在 target compatibility 阶段停止，绝不 omit 后继续
- AnyTLS 不会降级成 Trojan/VLESS。Parser Partial 节点保留在 target-neutral ProxySet；direct AnyTLS + Reality 或 TLS invariant 错误由 `validateIR()` 阻止
- Imported Config source 仍未实现
- 不执行网络请求或验证 Remote Rule 可达性
- Latency Sort 需要真实测速，因此返回 `SPEED_TEST_REQUIRED`
- DNS 只覆盖当前 Universal IR 的最小字段；Output Profile 可选择 redir-host 或 Fake-IP
- Desktop TUN 只生成跨平台安全的基础字段，不猜测设备名、接口、UID、路由表或本地路径
- Mihomo 运行设置保存在 Output 节点，不进入 Universal IR；sing-box 不消费这些字段
- Chain 不保证所有 UDP/传输协议组合均可工作
- Surge 与 sing-box 由独立 Compiler 处理；Loon、Stash、Shadowrocket、Quantumult X 等其他 Target 尚未实现

# sing-box Compiler MVP

Implementation baseline: **sing-box 1.13.14**

Verified against the official documentation on **2026-08-16**.

这是一条受版本约束的编译链，不代表无边界地“支持 sing-box”。实现以官方 [Changelog](https://sing-box.sagernet.org/changelog/)、[Configuration](https://sing-box.sagernet.org/configuration/)、[Migration](https://sing-box.sagernet.org/migration/) 和 1.13.14 官方容器标签为依据。

现代协议字段同时核对官方 [VLESS](https://sing-box.sagernet.org/configuration/outbound/vless/)、[TLS / Reality](https://sing-box.sagernet.org/configuration/shared/tls/)、[V2Ray Transport](https://sing-box.sagernet.org/configuration/shared/v2ray-transport/)、[Hysteria2](https://sing-box.sagernet.org/configuration/outbound/hysteria2/) 与 [TUIC](https://sing-box.sagernet.org/configuration/outbound/tuic/) 文档。

```text
ProxyFlowIR
    ↓
IR Validation
    ↓
sing-box Compatibility Check
    ↓
Target-specific Model
    ↓
Deterministic JSON
```

Compiler 是纯函数：不读取 Graph、Zustand、DOM 或 LocalStorage，不访问网络，不下载订阅或规则，也不转换第三方规则格式。浏览器 Parser 必须先把 Subscription materialize 为标准 endpoint，它只接收生成后的 Universal IR。

## Version decisions

- Route 使用现代 Rule Action：普通转发规则生成 `action: "route"` 与 `outbound`，拒绝规则生成 `action: "reject"`。
- Rule Set 只接受明确标记为 `sing-box-source` 或 `sing-box-binary` 的资源。
- Remote Rule Set 在 1.13.14 基线上生成 `url`、`format`、`update_interval`。不生成旧 `download_detour`；1.14 才引入的新 `http_client` 也不回填到 1.13.14 配置。
- GeoIP / GeoSite 不生成已移除的旧字段；只有未来能提供明确兼容 Rule Set 时才可表达。
- DNS 使用当前 typed DNS Server model，而不是 Mihomo 的 `redir-host` 模型。
- `detour` 只存在于 sing-box target layer，不进入 Universal IR。
- V2Ray `transport.type: "http"` 在无 TLS 时使用 plain HTTP/1.1；启用 TLS 时表示 HTTP/2。Universal HTTP/H2 discriminator 只在 `HTTP + no TLS` 与 `H2 + TLS` 两种组合中可无损 lowering，反向组合失败闭合。
- sing-box 的 QUIC custom TLS 仅支持 ECH；Hysteria2/TUIC client fingerprint 不会错误 lowering 成 `utls`。

## Source and strategy matrix

| Universal feature | Mihomo | sing-box 1.13.14 | Notes |
| --- | --- | --- | --- |
| Unresolved Subscription URL | HTTP proxy-provider | Error | sing-box 需要 materialized outbound；返回 `SINGBOX_SOURCE_REQUIRES_RESOLVED_PROXIES` |
| Materialized Subscription | explicit proxies | explicit outbounds | Supported |
| Provider URL | HTTP proxy-provider | Error | 不伪造不存在的 provider outbound |
| Manual SOCKS5 | `socks5` proxy | `socks` outbound | Supported |
| Manual HTTP | `http` proxy | `http` outbound | Supported |
| Shadowsocks | `ss` proxy | `shadowsocks` outbound | Supported basic subset |
| Trojan | `trojan` proxy | `trojan` outbound | Supported basic subset |
| VMess | `vmess` proxy | `vmess` outbound | Supported basic subset |
| VLESS | `vless` proxy | `vless` outbound | Supported basic subset |
| Reality / Vision | target TLS / flow | `tls.reality`、`tls.utls`、`flow` | Supported |
| WS / gRPC / HTTPUpgrade | target transport opts | typed V2Ray transport | Supported |
| HTTP transport + no TLS | `http-opts` | `type: http`（HTTP/1.1） | Supported |
| HTTP transport + TLS | `http-opts` | Error | `SINGBOX_TRANSPORT_HTTP_TLS_VARIANT_UNSUPPORTED` |
| H2 transport + TLS | `h2-opts` | `type: http` + TLS（HTTP/2） | Supported |
| H2 transport + no TLS | `h2-opts` | Error | `SINGBOX_TRANSPORT_H2_REQUIRES_TLS` |
| XHTTP | `xhttp-opts` | Error | 1.13.14 无对应 transport；`SINGBOX_TRANSPORT_XHTTP_UNSUPPORTED` |
| Hysteria2 | `hysteria2` proxy | `hysteria2` outbound | Supported normalized subset |
| TUIC v5 | `tuic` proxy | `tuic` outbound | Supported normalized subset |
| Hysteria2 port hopping | hyphen target syntax | colon `server_ports` syntax | Supported from structured IR |
| Hysteria2 fixed hop interval | `hop-interval` | `hop_interval` | Supported |
| Hysteria2 random hop interval | Supported | Error | 1.13.14 lacks `hop_interval_max`; `SINGBOX_HYSTERIA2_RANDOM_HOP_INTERVAL_UNSUPPORTED` |
| TUIC allow-insecure / disable-SNI | target TLS fields | `tls.insecure` / `tls.disable_sni` | Supported |
| Hysteria2 pin / ECH、Clash certificate fingerprint | Partial | excluded | No silent security downgrade |
| Hysteria2 / TUIC client fingerprint | target-dependent | Error | `SINGBOX_QUIC_TLS_FINGERPRINT_UNSUPPORTED` |
| Fixed | one-member select group | direct outbound reference | Supported for an explicit endpoint |
| Select | `select` group | `selector` outbound | Runtime switching requires Clash API |
| Auto Select | `url-test` group | `urltest` outbound | URL、interval、tolerance supported |
| Fallback | `fallback` group | Error | No semantics-preserving equivalent |
| Load Balance | `load-balance` group | Error | No semantics-preserving equivalent |
| Chain | `override.dialer-proxy` lowering | `detour` lowering | Requires materialized dial-capable endpoints |

## Routing matrix

| Matcher / target | sing-box mapping | Status |
| --- | --- | --- |
| Service with inline matchers | expanded route rules | Supported |
| Domain | `domain` | Supported |
| DomainSuffix | `domain_suffix` | Supported |
| DomainKeyword | `domain_keyword` | Supported |
| IPv4 / IPv6 CIDR | unified `ip_cidr` | Supported |
| Port | `port` | Supported |
| ASN | — | `SINGBOX_MATCHER_UNSUPPORTED` |
| GeoIP / GeoSite | compatible Rule Set required | Error when unavailable |
| sing-box source/binary Rule Set | `rule_set` | Supported |
| Clash YAML Rule Set | — | `SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED` |
| DIRECT | explicit `direct` outbound | Supported |
| ordinary REJECT | `action: "reject"` | Supported |
| Final DIRECT / strategy | `route.final` outbound tag | Supported |
| Final REJECT | explicit `block` outbound used by `route.final` | Supported |

Rule priority is stable: lower Universal `priority` first, then original insertion order. JSON object insertion order and all materialized list order are deterministic; tests compare 100 repeated string outputs.

## Rule resources

`RuleSource` remains target-neutral and now records resource format metadata. The sing-box resolver accepts only:

- `sing-box-source`: official source JSON format.
- `sing-box-binary`: compiled binary rule-set format.
- target-neutral inline Domain / Suffix / Keyword / CIDR / Port matchers.

`ios_rule_script` Clash YAML is still valid for the Mihomo compiler, but is not passed to sing-box. V0.4 does not fetch, inspect, convert, or re-host it.

## Proxy chain direction

Universal `hops` is defined as:

```text
client → hops[0] → hops[1] → ... → exit → internet
```

For `HK SOCKS → US HTTP`, the derived US outbound has `detour: "HK strategy tag"`. A three-hop chain first derives the middle outbound through hop 0, then derives the exit outbound through that middle strategy. Hysteria2 and TUIC outbounds also expose Dial Fields in 1.13.14 and are covered as two-hop chain exits. Detoured outbounds omit `domain_resolver` because sing-box Dial Fields make other dial fields inapplicable when `detour` is set.

Every hop must ultimately contain explicit supported proxy outbounds. An unresolved Subscription or Provider fails with `SINGBOX_CHAIN_REQUIRES_RESOLVED_OUTBOUND`; cycles fail closed in IR validation and again at target lowering boundaries.

## DNS MVP

Supported resolver kinds:

- DoH (`https` DNS server)
- DoT (`tls` DNS server)
- UDP
- system/local

The first valid resolver becomes `dns.final` and `route.default_domain_resolver`. Hostname proxy servers receive `domain_resolver`; literal IP servers do not. V0.6 does not implement FakeIP policy, DNS routing, ECS, rewrite, hijack, or split-horizon behavior.

## Inbound policy

V0.6 emits routing, DNS, and outbound configuration only. It does not guess TUN, Mixed, SOCKS, or HTTP inbound intent. A deployment-specific Runtime Inbound Profile remains a later target option; successful compilation includes `SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED` as informational compatibility output.

## Failure behavior and scope

All compatibility failures are stable, entity-addressable issues and return `success: false`, empty content, and `mock: false`. Partial proxy variants remain visible in Import Summary and produce compatibility warnings while being excluded from the usable ProxySet; unsupported strategy semantics still fail closed.

Not implemented: URL fetching inside the Target Compiler, XHTTP, non-Vision complex XTLS flow, WireGuard, inbound profiles, local rule-set paths, online rule conversion, and any third target.

# Loon Compiler Foundation

**Status: Foundation / not product-ready.** Loon is not a production target in
ProxyFlow 1.1.0. This document records an evidence-backed target audit and the
fail-closed boundary for the independent `src/targets/loon` backend. It does
not make Loon available in New Project, Target Switch, Export, or workspace
target surfaces. There is no real-client acceptance in this phase.

The intended pipeline is:

```text
Graph -> Universal IR -> Semantic Validation -> Loon Compatibility
     -> Loon Model -> Deterministic Serializer
```

The Loon adapter must consume the Universal IR. Loon-specific fields must stay
in the target model; Graph, Project, and the other target compilers are not
expanded to make a Loon mapping appear possible. When either the official
semantics or the IR mapping is incomplete, compilation fails closed instead of
dropping a field or selecting a merely similar option.

## Evidence baseline

The primary source is the official [LoonManual repository](https://github.com/Loon0x00/LoonManual). The default branch currently resolves to commit
[`4311d0030fe3065d4664b403a32010f083b99273`](https://github.com/Loon0x00/LoonManual/commit/4311d0030fe3065d4664b403a32010f083b99273). All links below are pinned to
that commit so that a later manual edit cannot silently change a capability
decision.

| Official page | Evidence used in this audit |
| --- | --- |
| [node.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L15-L39) | Protocol inventory: Shadowsocks, SSR, VMess, VLESS, Trojan, HTTP/HTTPS, WireGuard, Hysteria2, and custom JS. |
| [node.md formats](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L41-L142) | Comma-delimited proxy syntax, authentication, TLS/SNI, VMess/VLESS transports, Trojan options, Shadowsocks simple-obfs, Hysteria2, SSR, WireGuard, and JS fields. |
| [policy.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policy.md#L1-L32) | Node, built-in `DIRECT`/`REJECT`, and policy relationships. |
| [policygroup.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L1-L33) | Nested groups, `select`, `url-test`, `fallback`, `load-balance`, interval, tolerance, max-timeout, and Random/PCC/Round-Robin. |
| [domain_rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L1-L19) | `DOMAIN`, `DOMAIN-SUFFIX`, and `DOMAIN-KEYWORD`. |
| [ip_rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L1-L25) | `IP-CIDR`, `IP-CIDR6`, `GEOIP`, `IP-ASN`, and `no-resolve`. |
| [final_rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/final_rule.md#L1-L4) | `FINAL` as the fallback rule. |
| [rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) | Rule precedence: domain/IP matching has special behavior; other rules follow configuration order. |
| [logic_rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/logic_rule.md#L1-L27) | `AND`, `OR`, and `NOT` are native Loon matchers. |
| [port_rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/port_rule.md#L1-L18) | `SRC-PORT` and `DEST-PORT`, including ranges. |
| [sub_rule.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/sub_rule.md#L1-L14) | Remote rule-list URL and policy assignment syntax. |
| [dns.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L1-L33) | UDP, DoH, DoQ, DoH3, encrypted-vs-traditional precedence, concurrency, and fallback. |
| [general.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/general.md#L14-L77) | `[General]` DNS keys, `proxy-test-url`, and resource-parser. |
| [scheme.md](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/scheme.md#L21-L26) | Remote config/node/rule import links; this is not a proof of a target-native proxy source format. |

The page examples are normative evidence for the spelling and presence of a
field, but an example is not an allowlist. In particular, the node page does
not publish a complete Shadowsocks cipher table or a formal escaping grammar.

## Universal IR audit

The relevant current IR is documented by
[`src/core/proxy/model.ts`](../src/core/proxy/model.ts#L35-L162),
[`src/core/ir/strategy.ts`](../src/core/ir/strategy.ts#L3-L54),
[`src/core/ir/routing.ts`](../src/core/ir/routing.ts#L3-L37),
[`src/core/ir/dns.ts`](../src/core/ir/dns.ts#L1-L13), and
[`src/core/ir/source.ts`](../src/core/ir/source.ts#L5-L37).

Important boundaries found during the audit:

- HTTP credentials, TLS SNI/certificate intent, UUIDs, VMess `security` and
  optional `alterId`, VLESS security/encryption/flow, and TCP/WS/HTTP/H2/gRPC/
  HTTPUpgrade/XHTTP transport variants are represented.
- Shadowsocks has `method`, `password`, and opaque plugin metadata, but no
  explicit `udp` or `fast-open` field.
- Trojan and Hysteria2 carry TLS and transport/bandwidth/port-hopping data, but
  no explicit Loon `udp` or `fast-open` intent.
- Existing production adapters document a target-neutral convention that
  normalized non-HTTP proxy endpoints are UDP-capable (for example, Mihomo
  [emits `udp` for non-HTTP endpoints](../src/targets/mihomo/providers.ts#L87)
  and Surge [opts into UDP relay](../src/targets/surge/proxies.ts#L151-L161)). Loon may
  emit its documented `udp=true` only under that convention; an explicit
  per-endpoint UDP disable remains unrepresentable. `fast-open` has no such
  Universal field and must remain omitted or blocked when explicitly intended.
- There is no Universal endpoint model for SSR, WireGuard, or custom JS.
- `TrafficMatcherIR` has no `noResolve` flag, no logical matcher tree, no
  source/destination port discriminator, and no URL/UA/protocol matcher.
- `DnsIR` models `doh`, `dot`, `udp`, and `system`; it has no DoQ/DoH3 kind and
  its `direct`/`fallback` roles cannot be represented by Loon's global DNS
  keys.
- `RemoteProxySourceIR` retains URL, request profile, export mode, and snapshot
  identity, not a proof of the remote content format consumed by Loon.

## Protocol capability matrix

Each row states the exact subset that can be considered, not a claim that the
whole protocol family is supported. `Conditional` means a lowering is allowed
only after every listed guard passes. `Unproven` means the manual or the IR
does not establish an exact mapping. `Unsupported` is an explicit Foundation
scope boundary. `Deferred` means the protocol is intentionally outside this
phase even though Loon may have native syntax.

| Feature | Loon official semantics | Universal IR semantics | Mapping decision | Status | Diagnostic | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| HTTP, no auth | `http,name/server/port`; no credential fields are required. | `HttpProxyIR` with optional username/password. | Emit the bare HTTP form only when TLS is absent and credentials are absent. | Supported | - | [node.md#L61-L64](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L61-L64) |
| HTTP, username/password | Positional username and quoted password are documented. | Optional `username` and `password` are exact fields. | Emit both credentials together; reject a half-pair and unsafe delimiters. | Supported | `LOON_PROXY_AUTH_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [node.md#L61-L64](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L61-L64) |
| HTTPS | `https` supports credentials, `skip-cert-verify`, and `tls-name`/SNI. | `HttpProxyIR.tls` carries enabled, SNI, and allow-insecure, plus ALPN, fingerprint, and Reality fields. | Support only enabled ordinary TLS with exact credentials, `serverName`, and `allowInsecure`; block ALPN, fingerprint, Reality, disable-SNI, or other unproven fields. | Conditional | `LOON_PROXY_TLS_VARIANT_UNSUPPORTED` | [node.md#L66-L70](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L66-L70) |
| Shadowsocks core | `Shadowsocks,server,port,cipher,password`; examples show `aes-128-gcm` and `chacha20`, with optional `fast-open` and `udp`. | `ShadowsocksProxyIR` has method/password/plugin; the existing normalized endpoint convention implies UDP capability, but no explicit UDP disable or fast-open intent. | Allow only a separately audited Loon cipher set. Do not reuse Mihomo's allowlist. `udp=true` is permitted only under the existing convention; fast-open and explicit UDP intent remain deferred because the IR has no corresponding fields. | Conditional | `LOON_PROXY_CIPHER_UNSUPPORTED`, `LOON_PROXY_VARIANT_UNSUPPORTED` | [node.md#L43-L47](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L43-L47) |
| Shadowsocks simple-obfs | `obfs-name=http` or `tls`, `obfs-host`, and `obfs-uri` are explicit options. | Plugin name plus string or primitive record options can carry these keys. | Lower only the canonical simple-obfs option set and validate mode/host/URI. Unknown plugin options are a blocker; do not copy a Surge plugin spelling. | Conditional | `LOON_PROXY_VARIANT_UNSUPPORTED` | [node.md#L49-L52](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L49-L52) |
| Trojan, TCP | Password and TLS are required by the documented form; `alpn`, SNI, certificate skipping, and `udp` are options. | `TrojanProxyIR` has password, required TLS, and optional transport; normalized endpoint convention supplies UDP capability but not an explicit toggle. | Support ordinary TLS/TCP with proven SNI, ALPN, and allow-insecure fields. Emit `udp=true` only under the convention; explicit UDP intent remains deferred because the IR has no toggle. | Conditional | `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`, `LOON_PROXY_VARIANT_UNSUPPORTED` | [node.md#L120-L123](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L120-L123) |
| Trojan, WS/HTTP | Loon documents `transport=ws` and `transport=http`, with path/host and the same TLS options. | `ProxyTransportIR` carries WS and HTTP/HTTP2 variants, path, and host. | Support only the exact WS and plain HTTP variants; reject H2, gRPC, HTTPUpgrade, XHTTP, and explicit UDP/other metadata. | Conditional | `LOON_PROXY_TRANSPORT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED` | [node.md#L124-L130](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L124-L130) |
| VMess, TCP/WS/HTTP | Loon documents UUID, security, `transport=tcp`, `ws`, or `http`, `alterId`, path/host, TLS, SNI, and certificate skipping. `alterId=0` is described as enabling AEAD. | IR carries UUID/security and optional `alterId`, TLS, and transports, but an omitted `alterId` does not prove the AEAD intent. | Conditional support requires explicit, validated `security`, explicit `alterId` (including explicit zero), and only documented TCP/WS/HTTP fields. Never auto-fill `alterId=0`. | Conditional | `LOON_VMESS_VARIANT_UNSUPPORTED`, `LOON_PROXY_CIPHER_UNSUPPORTED` | [node.md#L72-L94](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L72-L94) |
| VLESS, TCP/WS/HTTP | Loon documents TCP, WS, and HTTP forms, with optional TLS, SNI, and certificate skipping. | IR additionally carries `security`, `encryption`, `flow=xtls-rprx-vision`, Reality, and modern transports. | Support only the basic documented transport/TLS subset when no unrepresentable security or transport intent is present. Reality, Vision, `flow`, gRPC, HTTPUpgrade, XHTTP, fingerprints, packet encoding, and unknown metadata block compilation. | Conditional | `LOON_VLESS_VARIANT_UNSUPPORTED`, `LOON_PROXY_TRANSPORT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED` | [node.md#L96-L118](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L96-L118) |
| Hysteria2, minimal | Loon documents server, port, password, SNI, certificate skipping, `udp`, and `fast-open`. | IR has password/TLS, obfs, bandwidth, server ports, and fixed/ranged hop interval; normalized endpoint convention supplies UDP capability but no fast-open toggle. | Consider password plus ordinary TLS/SNI and convention-derived `udp=true` as the minimal subset. Explicit fast-open/UDP intent remains unmodeled; obfs, bandwidth, port hopping, and any unproven option require a blocker. | Conditional | `LOON_HYSTERIA2_VARIANT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED` | [node.md#L135-L137](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L135-L137) |
| SOCKS5 | No SOCKS5 node format appears in the pinned official node protocol list or pages audited here. | `SocksProxyIR` is modeled. | Do not infer support from other clients; hold until a first-party Loon syntax page and parser/client fixture prove it. | Unproven | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L15-L39](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L15-L39) |
| ShadowsocksR | Loon gives an SSR syntax with protocol, protocol-param, obfs, and obfs-param. | No SSR endpoint type exists in Universal IR. | Defer; do not coerce SSR into Shadowsocks. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L54-L59](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L54-L59) |
| WireGuard | Loon documents a native WireGuard line with interface and peer structures. | No WireGuard endpoint model exists in Universal IR. | Defer; no schema expansion in Foundation. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L132-L133](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L132-L133) |
| Custom JS protocol | Loon uses `custom` plus a `script-path`. | No script path or JS protocol intent exists in Universal IR. | Defer; never emit a script reference from an opaque endpoint. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L139-L142](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L139-L142) |
| TUIC | No TUIC syntax is present in the pinned pages audited for this phase. | `TuicProxyIR` is modeled. | Defer; do not infer a TUIC spelling or downgrade to another protocol. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L15-L39](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L15-L39) |
| AnyTLS | No AnyTLS syntax is present in the pinned pages audited for this phase. | `AnyTlsProxyIR` is modeled. | Defer until official syntax and all security/session fields are audited. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L15-L39](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L15-L39) |

The protocol list proves that Loon can parse several families; it does not
prove that the current Universal IR can carry every option. A parsed partial
endpoint therefore remains visible to target projection but is skipped with a
target diagnostic, and a fixed endpoint with an incompatible variant blocks.

## Strategy matrix

| Universal strategy | Loon semantics | IR audit and lowering boundary | Status | Diagnostic | Evidence |
| --- | --- | --- | --- | --- | --- |
| Select | Manual selection of nodes; policy groups may contain policies and nested groups. | `SelectStrategyIR.candidates` preserves order and can reference strategies. Names must be deterministic and references must resolve. | Supported | `LOON_STRATEGY_REFERENCE_NOT_FOUND`, `LOON_SERIALIZER_UNSAFE_VALUE` | [policy.md#L8-L15](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policy.md#L8-L15), [policygroup.md#L1-L6](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L1-L6) |
| Nested Select | Loon explicitly allows policy groups to be nested. | Nested `strategy` candidates are exact only when every referenced group is emitted and names remain collision-safe. | Conditional | `LOON_STRATEGY_REFERENCE_NOT_FOUND`, `LOON_STRATEGY_CYCLE` | [policygroup.md#L1-L2](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L1-L2) |
| URL Test | `url`, interval seconds, and tolerance milliseconds; chooses the fastest child. | `AutoSelectStrategyIR` has a source and `HealthCheckIR.url/intervalSeconds/toleranceMs`. Lower only resolved members with the same group-scoped health intent. | Supported | `LOON_STRATEGY_TEST_URL_INVALID`, `LOON_STRATEGY_INTERVAL_INVALID`, `LOON_STRATEGY_TOLERANCE_INVALID` | [policygroup.md#L7-L13](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L7-L13) |
| Fallback | `url`, interval seconds, `max-timeout` milliseconds; chooses the first available child. | IR carries URL/interval/tolerance but no `maxTimeoutMs`. Omit max-timeout only when Universal intent does not require a timeout and Loon's default is accepted explicitly. Tolerance cannot be emitted. | Conditional | `LOON_FALLBACK_TOLERANCE_UNSUPPORTED` (`LOON_FALLBACK_MAX_TIMEOUT_UNSUPPORTED` reserved) | [policygroup.md#L15-L21](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L15-L21) |
| Fixed | A single node can itself be a policy. | A fixed strategy with exactly one resolved endpoint can be represented by a single-member `select` group, preserving the strategy name. | Supported | `LOON_STRATEGY_NO_COMPATIBLE_MEMBERS` | [policy.md#L8-L15](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policy.md#L8-L15) |
| Load Balance / Round-Robin | Loon's Round-Robin algorithm selects child policies in rotation. | `LoadBalanceStrategyIR.mode=round-robin` is an ordered cycle; preserve member order and reject empty sets. | Supported | `LOON_STRATEGY_NO_COMPATIBLE_MEMBERS` | [policygroup.md#L23-L33](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L23-L33) |
| Load Balance / Random | Loon selects a child randomly. | The current IR has no random mode. | Unsupported | `LOON_LOAD_BALANCE_RANDOM_UNSUPPORTED` (reserved) | [policygroup.md#L23-L33](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L23-L33) |
| Load Balance / PCC | Loon locks requests with the same hostname to one child. | Do not equate this with Universal `consistent-hash`: the IR does not declare the same hash key, hostname normalization, stickiness lifetime, or request scope. | Unsupported | `LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED` | [policygroup.md#L23-L33](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L23-L33) |
| Proxy Chain | No native chain or `underlying-proxy` syntax is established by the audited policy-group page. | `ChainStrategyIR.hops` is client-to-exit order, but nested groups are not a proxy chain. | Unproven; do not emulate with nested groups. An active chain is a blocker; an unused chain is omitted with a warning so unrelated active routes remain compilable. | `LOON_PROXY_CHAIN_UNPROVEN` | [policygroup.md#L1-L33](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L1-L33) |

Projection follows active Project intent rather than every endpoint in a
subscription inventory: an unused incompatible endpoint is skipped with an
aggregated warning; a partially compatible pool may continue while at least one
member remains; an all-incompatible pool is a blocker; and an explicitly fixed
incompatible endpoint is a blocker. Loon uses its own evaluator and does not
reuse the Surge evaluator.

## Routing matrix

| Universal matcher | Loon mapping and official semantics | IR gap / decision | Status | Diagnostic | Evidence |
| --- | --- | --- | --- | --- | --- |
| Domain | `DOMAIN,value,policy`, exact domain match. | `DomainMatcherIR.value` is exact. | Supported | - | [domain_rule.md#L3-L7](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L3-L7) |
| Domain suffix | `DOMAIN-SUFFIX`, suffix matching without a partial-label false positive. | `DomainSuffixMatcherIR.value` is exact. | Supported | - | [domain_rule.md#L9-L13](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L9-L13) |
| Domain keyword | `DOMAIN-KEYWORD`. | `DomainKeywordMatcherIR.value` is exact. | Supported | - | [domain_rule.md#L15-L19](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L15-L19) |
| IPv4 CIDR | `IP-CIDR`. | `IpCidrMatcherIR.value` is exact for the CIDR itself. | Supported | - | [ip_rule.md#L3-L6](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L3-L6) |
| IPv6 CIDR | `IP-CIDR6`. | `IpCidr6MatcherIR.value` is exact for the CIDR itself. | Supported | - | [ip_rule.md#L8-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L8-L11) |
| GEOIP | `geoip,country,policy`; Loon queries the IP country/region database. | `GeoIpMatcherIR.countryCode` is exact, subject to Loon's own database. | Supported | - | [ip_rule.md#L13-L17](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L13-L17) |
| IP-ASN | `IP-ASN,asn,policy`, with optional `no-resolve`. | `AsnMatcherIR.value` exists, but the IR has no `noResolve` intent or target-neutral convention. Emitting the rule without that flag could trigger a DNS lookup and change behavior. | Unsupported in this foundation | `LOON_ROUTE_NO_RESOLVE_UNMODELED` | [ip_rule.md#L19-L25](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L19-L25) |
| FINAL | `final,policy` is the fallback after no rule matches. | `FinalRouteIR.target` is exact for DIRECT, REJECT, or a compiled strategy. | Supported | - | [final_rule.md#L1-L4](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/final_rule.md#L1-L4) |
| no-resolve | With the flag, only an already-IP destination matches; a domain is not DNS-resolved for the IP rule. | `TrafficMatcherIR` has no resolve/no-resolve intent and no existing target-neutral convention. Never add it to every CIDR rule and never drop an explicit future intent. | Unproven | `LOON_ROUTE_NO_RESOLVE_UNMODELED` | [ip_rule.md#L19-L25](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L19-L25) |
| Port | Loon has `DEST-PORT` and `SRC-PORT`, including ranges and open intervals. | `PortMatcherIR` carries only one number and no direction/range. Treat it as destination-only only if the existing Universal contract is explicitly documented; source/range forms block. | Conditional | `LOON_PORT_MATCHER_UNSUPPORTED` | [port_rule.md#L1-L18](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/port_rule.md#L1-L18) |
| Logical rules | Loon supports nested `AND`, `OR`, and `NOT`. | IR has no logical matcher tree. | Unsupported | `LOON_LOGICAL_RULE_UNSUPPORTED` (reserved) | [logic_rule.md#L1-L27](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/logic_rule.md#L1-L27) |
| Protocol / URL / User-Agent | Loon has protocol rules and HTTP URL/UA rules. | No corresponding Universal matcher types. | Unsupported | `LOON_MATCHER_UNSUPPORTED` | [protocol_rule.md#L1-L8](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/protocol_rule.md#L1-L8), [http_rule.md#L1-L12](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/http_rule.md#L1-L12) |
| Rule Set / remote list | A URL ending in a Loon rule list can be assigned a policy. | `RuleSourceIR` can retain remote URL/format, but current first-party assets expose only Mihomo YAML and Surge LIST; no Loon artifact or update/failure contract is proven. | Unproven | `LOON_RULE_SOURCE_FORMAT_UNPROVEN` | [sub_rule.md#L1-L5](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/sub_rule.md#L1-L5) |
| First-party Service Rules | Loon's remote rule-list syntax can carry a URL and policy. | `kure29/proxyflow-rules` currently has no audited Loon artifact in `src/data/serviceRuleAssets.ts`; do not copy Surge `.list` URLs. The current adapter blocks service matcher routes entirely; inline service lowering is follow-up work. | Unproven | `LOON_SERVICE_RULE_SOURCE_UNPROVEN` | [sub_rule.md#L1-L5](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/sub_rule.md#L1-L5) |
| Rule order | Loon gives domain/IP rules special matching behavior and otherwise uses configuration order. | Universal routes carry explicit priority/insertion order. Sorting by matcher type is forbidden; mixed domain/IP route precedence is not automatically equivalent. | Conditional | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` (reserved pending client fixture) | [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |

The route compiler preserves Universal priority order for every emitted rule and
never sorts by matcher type. Loon's domain/IP precedence still requires a real
client acceptance fixture; until that exists, mixed domain/IP behavior is a
documented product-readiness risk rather than a silently claimed equivalence.

## DNS matrix

Loon separates ordinary DNS from encrypted DNS (DoH/DoQ/DoH3). When both are
configured, the manual says that encrypted DNS is used, valid servers are
queried concurrently, and a failed encrypted lookup can fall back to ordinary
DNS. That is not the same as an unordered Universal peer resolver set in every
case.

| Universal DNS intent | Loon mapping | Decision | Status | Diagnostic | Evidence |
| --- | --- | --- | --- | --- | --- |
| Undefined / disabled | Omit DNS keys; Loon owns its default behavior. | Exact when no explicit resolver intent is active. | Supported | - | [dns.md#L1-L14](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L1-L14) |
| Automatic | Omit explicit DNS keys and use Loon defaults, only under the Universal automatic contract. | Do not emit a guessed resolver. | Supported | - | [dns.md#L23-L30](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L23-L30) |
| System default | `dns-server = system`. | Supported for a default-role system resolver with no incompatible peers. | Supported | - | [dns.md#L11-L16](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L11-L16) |
| IPv4 UDP | `dns-server = address`, comma-separated; `system` is also valid. | The audited examples prove bare IPv4 literals only. Port-bearing and IPv6 forms are rejected until Loon parser evidence establishes their grammar. | Conditional | `LOON_DNS_UDP_PORT_UNPROVEN`, `LOON_DNS_IPV6_UDP_UNPROVEN` | [dns.md#L11-L16](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L11-L16) |
| IPv6 UDP | No unambiguous IPv6 address/port parser form is shown in the audited examples. | Do not guess colon/bracket syntax. | Unproven | `LOON_DNS_IPV6_UDP_UNPROVEN` | [dns.md#L11-L16](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L11-L16) |
| Pure DoH | `doh-server = https://...`, comma-separated URLs. | Support only safe absolute HTTPS URLs and the default role. | Supported | `LOON_DNS_RESOLVER_ADDRESS_INVALID`, `LOON_DNS_RESOLVER_SCHEME_MISMATCH` | [dns.md#L15-L16](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L15-L16) |
| DoT | No DoT key or `tls://` form is documented in the audited Loon pages. | Never map DoT to DoH, DoQ, or ordinary UDP. | Unsupported | `LOON_DNS_DOT_UNSUPPORTED` | [dns.md#L3-L20](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L3-L20) |
| DoQ | Loon documents `doq-server = quic://...` (default port 784). | IR has no DoQ kind; no new Project field in Foundation. | Unproven | `LOON_DNS_DOQ_UNMODELED` (reserved) | [dns.md#L17-L18](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L17-L18) |
| DoH3 | Loon documents `doh3-server = h3://...`. | IR has no DoH3 kind; no silent downgrade. | Unproven | `LOON_DNS_DOH3_UNMODELED` (reserved) | [dns.md#L19-L20](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L19-L20) |
| Direct / fallback resolver roles | Global Loon keys do not carry Universal resolver roles. | Do not flatten role-specific resolvers into `dns-server` or `doh-server`. | Unsupported | `LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED`, `LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED` | [dns.md#L23-L33](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L23-L33) |
| Mixed traditional + encrypted | Loon prefers encrypted DNS and has its own fallback/concurrency behavior. | If Universal intent requires peer/mixed semantics, block; do not assume comma lists are equivalent. | Unsupported | `LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED` | [dns.md#L23-L33](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/dns.md#L23-L33) |

`dns-server`, `doh-server`, `doq-server`, and `doh3-server` belong in
`[General]`; resolver order is retained for deterministic bytes but must not be
described as priority because Loon queries valid servers concurrently.

## Remote proxy sources and services

The node manual says that Loon downloads and parses provider subscription nodes,
and the scheme page documents remote import actions. Those statements do not
define a target-native format contract matching
`RemoteProxySourceIR.url + requestProfile + exportMode`. The Foundation policy is:

| Source mode | Foundation decision |
| --- | --- |
| Auto | Use the validated materialized snapshot when it is available and target-neutral processing is complete. |
| Materialized | Emit explicit, compatibility-checked Loon proxy lines from the snapshot. |
| Remote | Block unless a first-party Loon source-format contract, request behavior, refresh behavior, and failure semantics are proven. Never silently convert Remote to Materialized. |

Remote mode currently reports `LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`.
`ProviderSourceIR` and imported configs are not treated as Loon-native remote
sources. The compiler does not fetch URLs or parse subscriptions.

For first-party Service Rules, `sub_rule.md` proves a URL-plus-policy list
syntax, but the repository's service catalog currently provides only Mihomo and
Surge artifacts. Until `kure29/proxyflow-rules` publishes and documents a Loon
artifact, service routing remains unproven and reports
`LOON_SERVICE_RULE_SOURCE_UNPROVEN`.

## Serialization and determinism

The serializer must produce UTF-8, LF line endings, deterministic section and
entry order, and exactly one trailing newline. The target baseline uses
`[General]`, `[Proxy]`, `[Proxy Group]`, and `[Rule]`; `[General]`, group, and
rule section evidence is explicit in the audited pages, while the node examples
imply `[Proxy]` and still require a parser/client fixture before product
readiness. Section names are based on the Loon manual, not copied from Surge
field semantics ([`general.md`](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/general.md#L1-L20), [`policygroup.md`](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L1-L6), [`plugin.md`](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/plugin.md#L18-L33)).

The official examples are comma-delimited and quote some passwords, but the
audited manual does not specify a complete escape grammar for arbitrary names
or every value. One shared helper owns all value quoting, while policy names on
the left-hand side are rejected when quoting is not proven. The examples also
vary protocol-token casing (`Shadowsocks`, `VMess`, `VLESS`,
`http`, and `Hysteria2`); casing must be fixed by a Loon parser/client fixture,
not inferred from another target.

- reject comma, equals, quote, backslash, CR, LF, NUL, and ambiguous leading or
  trailing whitespace in policy names;
- allow ordinary UTF-8 text only where the parser fixture proves it safe;
- never split or quote values differently in individual protocol serializers;
- report `LOON_SERIALIZER_UNSAFE_VALUE` and emit no partial configuration when a
  value cannot be represented safely.

Serializer fixtures must include the hostile names `HK, Premium`, `foo=bar`,
`quote`, a name containing a newline, and a UTF-8 Unicode name. Delimiter,
control-character, and newline cases must fail closed; a Unicode case may pass
only after a Loon parser/client fixture proves that it round-trips.

Repeated compilation of the same IR must be byte-identical: proxy and group
order, route order, diagnostic order, derived names, and all section keys are
stable. No timestamps, random names, or comments are used to carry semantics.

## Diagnostic inventory

Target-owned diagnostics use the `LOON_` prefix and retain code, severity,
entity/source mapping, and a human-readable message. Shared Universal IR
validation is additionally surfaced as `IR_*` with `target: loon`; those codes
are not Loon capability claims. The lists below distinguish codes reachable in
this foundation from names reserved for a future IR expansion.

Currently emitted by `src/targets/loon`:

- `LOON_SOURCE_REQUIRES_RESOLVED_PROXIES`, `LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`, `LOON_REMOTE_PROXY_SOURCE_MATERIALIZED`
- `LOON_PROXY_PROTOCOL_UNSUPPORTED`, `LOON_PROXY_VARIANT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`, `LOON_PROXY_CIPHER_UNSUPPORTED`, `LOON_PROXY_AUTH_UNSUPPORTED`, `LOON_PROXY_TRANSPORT_UNSUPPORTED`
- `LOON_PROXY_SERVER_INVALID`, `LOON_PROXY_SET_ENDPOINTS_SKIPPED`, `LOON_PROXY_ID_DUPLICATE`, `LOON_SERIALIZER_UNSAFE_VALUE`
- `LOON_VMESS_VARIANT_UNSUPPORTED`, `LOON_VLESS_VARIANT_UNSUPPORTED`, `LOON_HYSTERIA2_VARIANT_UNSUPPORTED`
- `LOON_STRATEGY_NO_COMPATIBLE_MEMBERS`, `LOON_FIXED_PROXY_UNRESOLVED`, `LOON_STRATEGY_CYCLE`, `LOON_STRATEGY_REFERENCE_NOT_FOUND`, `LOON_TARGET_REFERENCE_NOT_FOUND`
- `LOON_STRATEGY_TEST_URL_INVALID`, `LOON_STRATEGY_INTERVAL_INVALID`, `LOON_STRATEGY_TOLERANCE_INVALID`, `LOON_FALLBACK_TOLERANCE_UNSUPPORTED`, `LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED`, `LOON_LOAD_BALANCE_ALGORITHM_UNPROVEN`, `LOON_PROXY_CHAIN_UNPROVEN`
- `LOON_ROUTE_PRIORITY_INVALID`, `LOON_MATCHER_UNSUPPORTED`, `LOON_PORT_MATCHER_UNSUPPORTED`, `LOON_ROUTE_NO_RESOLVE_UNMODELED`, `LOON_RULE_SOURCE_FORMAT_UNPROVEN`, `LOON_SERVICE_RULE_SOURCE_UNPROVEN`
- `LOON_DNS_CUSTOM_EMPTY`, `LOON_DNS_RESOLVER_ID_DUPLICATE`, `LOON_DNS_RESOLVER_DUPLICATE`, `LOON_DNS_RESOLVER_ADDRESS_INVALID`, `LOON_DNS_RESOLVER_SCHEME_MISMATCH`, `LOON_DNS_DOT_UNSUPPORTED`, `LOON_DNS_UDP_PORT_UNPROVEN`, `LOON_DNS_IPV6_UDP_UNPROVEN`, `LOON_DNS_UDP_HOSTNAME_UNSUPPORTED`, `LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED`, `LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED`, `LOON_DNS_RESOLVER_ROLE_UNSUPPORTED`, `LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED`
- `LOON_POLICY_NAME_RESERVED`, `LOON_POLICY_NAME_DUPLICATE`

Reserved until the corresponding Universal intent is modeled and proven:

- `LOON_PROXY_UDP_INTENT_UNSUPPORTED`, `LOON_STRATEGY_UNSUPPORTED`, `LOON_FALLBACK_MAX_TIMEOUT_UNSUPPORTED`
- `LOON_LOAD_BALANCE_RANDOM_UNSUPPORTED`, `LOON_LOGICAL_RULE_UNSUPPORTED`, `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`
- `LOON_DNS_DOQ_UNMODELED`, `LOON_DNS_DOH3_UNMODELED`

Diagnostics are blockers when active intent cannot be represented. An inactive
strategy and its inventory are evaluated in an isolated warning scope, so an
unused incompatible endpoint, name collision, or target-specific serialization
issue cannot poison an active profile. An incompatible member in an active pool
may be skipped only when at least one exact member remains. An empty active
strategy, fixed incompatibility, unresolved active reference, or unsafe
serialization is an error and produces empty output. Shared Universal IR
semantic-validation errors (`IR_*`) remain global blockers because they describe
malformed graph structure rather than an unreferenced Loon capability.

## Follow-up IR requirements

These gaps are intentionally recorded rather than added to the schema in this
phase:

- explicit proxy UDP/fast-open intent for protocols that expose those options;
- VMess AEAD/alterId intent with a defined omission meaning;
- route `noResolve` and source/destination port direction/range;
- logical, protocol, URL, and User-Agent matcher trees;
- DoQ and DoH3 resolver kinds plus role/fallback semantics;
- a target-neutral remote source content-format contract;
- a formal, tested Loon escaping grammar and a first-party Loon service-rule
  artifact.

Until those requirements are proven and modeled, the corresponding rows remain
fail-closed. No Project schema migration, automatic Loon exposure, version
bump, release, or runtime behavior change is implied by this document.

# Loon Compiler Foundation

**Status: Foundation / not product-ready.** Loon is not a production target in
ProxyFlow 1.1.0. This document records an evidence-backed target audit, the
fail-closed boundary for the independent `src/targets/loon` backend, and the
successful acceptance of its audited materialized subset. It does not make
Loon available in New Project, Target Switch, Export, or workspace target
surfaces.

The developer-only real-client preparation workflow is documented in
[`docs/loon-acceptance.md`](loon-acceptance.md); its recorded status is
`REAL LOON IMPORT: PASSED`, `REAL PROXY TRAFFIC: PASSED`, and
`LOON SERVICE RULE REAL CLIENT ACCEPTANCE: PASSED` for the audited OpenAI
scenario.

## Acceptance status

- Compiler Foundation: **IMPLEMENTED**
- Sanitized deterministic compiler acceptance: **PASSED**
- Core Real Client Acceptance: **PASSED**
- Real subscription projection: **PASSED** (`95` candidates, `91` compatible,
  `4` intentionally skipped, `0` blockers)
- Real Loon client import: **PASSED** on Loon `3.5.0 (975)`
- Real proxy traffic: **PASSED**
- First-party Service Rules Foundation: **IMPLEMENTED**
- Deterministic Service Rules acceptance: **PASSED**
- Real Loon Service Rules acceptance: **PASSED** for OpenAI on Loon `3.5.0 (975)`
- Tested iOS version: **NOT RECORDED**
- Product exposure: **NOT ENABLED**

The recorded client result validates the core materialized subset represented
by the accepted profile. First-party Service Rules are a separate acceptance
axis: the current typed, untagged OpenAI Remote Rule has passed import,
fetch/refresh, policy-binding, and traffic checks with `FINAL -> DIRECT`.
Long-duration failure behavior, offline cache persistence, other-service direct
client evidence, and ordering remain pending or blocked as stated below. Neither
axis widens the deferred protocol, serializer, arbitrary remote source, or
product-exposure boundaries.

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

The historical pinned source is the official [LoonManual repository](https://github.com/Loon0x00/LoonManual). The Foundation baseline uses commit
[`4311d0030fe3065d4664b403a32010f083b99273`](https://github.com/Loon0x00/LoonManual/commit/4311d0030fe3065d4664b403a32010f083b99273). All links below are pinned to
that commit so that a later manual edit cannot silently change a historical
capability decision.

The current first-party capability source was also audited at
[`https://nsloon.app/docs/Node/`](https://nsloon.app/docs/Node/) on **2026-08-24**.
That page now explicitly lists Shadowsocks stream/AEAD/2022, Simple Obfs,
SOCKS5, VLESS TCP/WS/HTTP and XTLS Vision + Reality, Hysteria2, and AnyTLS
(Build 945+). Its examples prove exact spellings including
`2022-blake3-aes-128-gcm`, `obfs-name=http|tls`, fixed quoted credentials
containing `=`, and an HTTP username containing a comma in fixed quotes. This
current page supersedes stale claims that those Loon features are absent. It
does not, by itself, prove that ProxyFlow's Universal IR preserves every field
or that this adapter has a lossless lowering; those remain separate decisions
below.

The Service Rules evidence is independently pinned. ProxyFlow's owned rule
repository was audited at
[`27d38e44282115e071d19c846c17e14e6d2e584b`](https://github.com/kure29/proxyflow-rules/commit/27d38e44282115e071d19c846c17e14e6d2e584b).
Its canonical JSON, generator, validator, and generated `rules/loon/*.list`
matrix establish the content and URLs of ProxyFlow's ten first-party assets.
The current Loon rule-subscription documentation is pinned through its
first-party site source at
[`65292c2089fb3fd8b43a8dfbeeaa5f286d7cc737`](https://github.com/Loon0x00/Loon0x00.github.io/commit/65292c2089fb3fd8b43a8dfbeeaa5f286d7cc737),
and the full-profile syntax example is pinned to LoonExampleConfig commit
[`dfbfc0b74dd689d9d76d5b6da7fe3778791c0710`](https://github.com/Loon0x00/LoonExampleConfig/commit/dfbfc0b74dd689d9d76d5b6da7fe3778791c0710).
These sources have different ownership: `proxyflow-rules` proves our asset
generation, while the two Loon sources prove the client configuration syntax.

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
| [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) | Current first-party protocol inventory and exact node examples. It is capability evidence, not automatic Universal-IR mapping or real-client acceptance evidence. |
| [Current Remote Rule page source](https://github.com/Loon0x00/Loon0x00.github.io/blob/65292c2089fb3fd8b43a8dfbeeaa5f286d7cc737/docs/Rule/sub_rule.md#L5-L10) | A rule subscription is a remote rule collection whose lines use Loon-supported rule syntax; the page shows URL-plus-policy subscription syntax. |
| [LoonExampleConfig `example.conf`](https://github.com/Loon0x00/LoonExampleConfig/blob/dfbfc0b74dd689d9d76d5b6da7fe3778791c0710/example.conf#L101-L105) | First-party full-profile evidence for `[Remote Rule]` and the exact `URL,policy=PROXY,enabled=true` entry form. |
| [`proxyflow-rules` architecture](https://github.com/kure29/proxyflow-rules/blob/27d38e44282115e071d19c846c17e14e6d2e584b/README.md#L17-L29) | Ten service JSON documents are the canonical source for generated Loon LIST assets. Generator and validator evidence is pinned separately below. |

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
| HTTP, username/password | Positional username plus a fixed double-quoted password are documented; the current page also shows a comma-containing username in fixed quotes. | Optional `username` and `password` are exact fields. | Keep ordinary usernames raw; when an HTTP username contains a comma, emit the explicitly evidenced `"user,name"` form. Emit the password as a fixed quoted literal. Equals/colon are admitted in fixed quoted credentials; quotes, backslashes, controls, Unicode, and unproven comma-containing passwords remain blocked. | Supported | `LOON_PROXY_AUTH_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [node.md#L61-L64](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L61-L64), [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) |
| HTTPS | `https` supports credentials, `skip-cert-verify`, and `tls-name`/SNI. The current Reality evidence is specific to VLESS. | `HttpProxyIR.tls` carries enabled, SNI, and allow-insecure, plus ALPN, fingerprint, and Reality fields. | Support only enabled ordinary TLS with exact credentials, `serverName`, and `allowInsecure`; block ALPN, fingerprint, Reality, disable-SNI, or other fields without a lossless ordinary-HTTPS mapping. | Conditional | `LOON_PROXY_TLS_VARIANT_UNSUPPORTED` | [node.md#L66-L70](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L66-L70) |
| Shadowsocks core | `Shadowsocks,server,port,cipher,"password"`; the current page shows `aes-128-gcm`, `chacha20`, and `2022-blake3-aes-128-gcm` with a quoted credential containing `=`. | `ShadowsocksProxyIR` preserves method/password/plugin as opaque fields; it does not model SS2022 key roles or lengths. | Accept only those three exact cipher values. Emit the password as a fixed quoted literal and preserve its opaque value; do not claim arbitrary SS2022 key validation or infer values from SSR, Mihomo, Surge, or community configurations. `udp=true` follows the existing normalized endpoint convention; fast-open and explicit UDP intent remain unmodeled. `2022-blake3-aes-256-gcm` and other unshown values fail closed. | Conditional | `LOON_PROXY_CIPHER_UNSUPPORTED`, `LOON_PROXY_VARIANT_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) |
| Shadowsocks simple-obfs | Loon target syntax uses `obfs-name=http` or `tls`, `obfs-host`, and optional `obfs-uri`; SIP003 source semantics use `obfs=http|tls` and `obfs-host`. | Plugin name plus string or primitive record options preserve the source keys. | Lower only the exact canonical `simple-obfs` plugin. Map source `obfs` to target `obfs-name`, preserve `obfs-host`, and emit `obfs-uri` only when source intent explicitly contains it. Target-shaped `obfs-name` remains accepted; arbitrary `mode`, `host`, `uri`, or `path` aliases and other plugin names remain blockers. | Conditional | `LOON_PROXY_VARIANT_UNSUPPORTED` | [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) |
| Trojan, TCP | Fixed double-quoted password and TLS are required by the documented form; `alpn`, SNI, certificate skipping, and `udp` are options. | `TrojanProxyIR` has password, required TLS, and optional transport; normalized endpoint convention supplies UDP capability but not an explicit toggle. | Emit password as a fixed quoted literal and support ordinary TLS/TCP with proven SNI, ALPN, and allow-insecure fields. Emit `udp=true` only under the convention; explicit UDP intent remains deferred because the IR has no toggle. | Conditional | `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`, `LOON_PROXY_VARIANT_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [node.md#L120-L123](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L120-L123) |
| Trojan, WS/HTTP | Loon documents `transport=ws` and `transport=http`, with path/host and the same TLS options. | `ProxyTransportIR` carries WS and HTTP/HTTP2 variants, path, and host. | Support only the exact WS and plain HTTP variants; reject H2, gRPC, HTTPUpgrade, XHTTP, and explicit UDP/other metadata. | Conditional | `LOON_PROXY_TRANSPORT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED` | [node.md#L124-L130](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L124-L130) |
| VMess, TCP/WS/HTTP | Loon documents quoted UUID, security, `transport=tcp`, `ws`, or `http`, `alterId`, path/host, TLS, SNI, and certificate skipping. The pinned examples use `aes-128-gcm`; `alterId=0` is described as enabling AEAD. | IR carries UUID/security and optional `alterId`, TLS, and transports, but an omitted `alterId` does not prove the AEAD intent. | Emit UUID as a fixed quoted literal. Conditional support requires the directly evidenced `security=aes-128-gcm`, explicit `alterId` (including explicit zero), and only documented TCP/WS/HTTP fields. Never infer `auto`, `none`, or another security value, and never auto-fill `alterId=0`. | Conditional | `LOON_VMESS_VARIANT_UNSUPPORTED`, `LOON_PROXY_CIPHER_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [node.md#L72-L94](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L72-L94) |
| VLESS, TCP/WS/HTTP | The current page documents quoted UUID in TCP, WS, and HTTP forms and separately shows XTLS Vision + Reality fields. | IR carries `security`, `encryption`, `flow`, Reality, and modern transports. | Emit only the basic TCP/WS/HTTP and ordinary TLS subset. The official Reality/flow syntax is now proven, but exact IR preservation and lowering are deferred; Reality, Vision, flow, gRPC, HTTPUpgrade, XHTTP, fingerprints, packet encoding, and unknown metadata still block compilation. | Conditional | `LOON_VLESS_VARIANT_UNSUPPORTED`, `LOON_PROXY_TRANSPORT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) |
| Hysteria2, minimal | Loon documents server, port, fixed double-quoted password, SNI, certificate skipping, `udp`, and `fast-open`. | IR has password/TLS, obfs, bandwidth, server ports, and fixed/ranged hop interval; normalized endpoint convention supplies UDP capability but no fast-open toggle. | Emit password as a fixed quoted literal and consider ordinary TLS/SNI plus convention-derived `udp=true` as the minimal subset. Explicit fast-open/UDP intent remains unmodeled; obfs, bandwidth, port hopping, and any unproven option require a blocker. | Conditional | `LOON_HYSTERIA2_VARIANT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE` | [node.md#L135-L137](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L135-L137) |
| SOCKS5 | The current page explicitly lists SOCKS5 and shows `socks5,server,port` forms with quoted credentials. | `SocksProxyIR` is modeled, but no Loon lowering or client fixture is included in this phase. | Treat the official syntax as proven capability evidence, while keeping the ProxyFlow protocol deferred until field-by-field lowering and real-client acceptance are audited. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) |
| ShadowsocksR | Loon gives an SSR syntax with protocol, protocol-param, obfs, and obfs-param. | No SSR endpoint type exists in Universal IR. | Defer; do not coerce SSR into Shadowsocks. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L54-L59](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L54-L59) |
| WireGuard | Loon documents a native WireGuard line with interface and peer structures. | No WireGuard endpoint model exists in Universal IR. | Defer; no schema expansion in Foundation. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L132-L133](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L132-L133) |
| Custom JS protocol | Loon uses `custom` plus a `script-path`. | No script path or JS protocol intent exists in Universal IR. | Defer; never emit a script reference from an opaque endpoint. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L139-L142](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L139-L142) |
| TUIC | No TUIC syntax is present in the pinned pages audited for this phase. | `TuicProxyIR` is modeled. | Defer; do not infer a TUIC spelling or downgrade to another protocol. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [node.md#L15-L39](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/node.md#L15-L39) |
| AnyTLS | The current page explicitly lists AnyTLS (Build 945+) and shows a node form. | `AnyTlsProxyIR` is modeled, but session/security field parity has not been audited. | Keep deferred until exact Universal mapping and client acceptance exist; do not infer support from the official protocol listing alone. | Deferred | `LOON_PROXY_PROTOCOL_UNSUPPORTED` | [Current Node page](https://nsloon.app/docs/Node/) (retrieved 2026-08-24) |

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
| Domain | `DOMAIN,value,policy`, exact domain match. | `DomainMatcherIR.value` is exact. | Conditional: supported within a pure domain-family route set; mixed domain/IP sets are blocked. | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for mixed families | [domain_rule.md#L3-L7](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L3-L7), [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |
| Domain suffix | `DOMAIN-SUFFIX`, suffix matching without a partial-label false positive. | `DomainSuffixMatcherIR.value` is exact. | Conditional: supported within a pure domain-family route set; mixed domain/IP sets are blocked. | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for mixed families | [domain_rule.md#L9-L13](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L9-L13), [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |
| Domain keyword | `DOMAIN-KEYWORD`. | `DomainKeywordMatcherIR.value` is exact. | Conditional: supported within a pure domain-family route set; mixed domain/IP sets are blocked. | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for mixed families | [domain_rule.md#L15-L19](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/domain_rule.md#L15-L19), [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |
| IPv4 CIDR | `IP-CIDR`. | `IpCidrMatcherIR.value` is exact for the CIDR itself. | Conditional: supported within a pure IP-family route set; mixed domain/IP sets are blocked. | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for mixed families | [ip_rule.md#L3-L6](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L3-L6), [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |
| IPv6 CIDR | `IP-CIDR6`. | `IpCidr6MatcherIR.value` is exact for the CIDR itself. | Conditional: supported within a pure IP-family route set; mixed domain/IP sets are blocked. | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for mixed families | [ip_rule.md#L8-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L8-L11), [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |
| GEOIP | `geoip,country,policy`; Loon queries the IP country/region database. | `GeoIpMatcherIR.countryCode` is exact, subject to Loon's own database. | Conditional: supported within a pure IP-family route set; mixed domain/IP sets are blocked. | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for mixed families | [ip_rule.md#L13-L17](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L13-L17), [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |
| IP-ASN | `IP-ASN,asn,policy`, with optional `no-resolve`. | `AsnMatcherIR.value` exists, but the IR has no `noResolve` intent or target-neutral convention. Emitting the rule without that flag could trigger a DNS lookup and change behavior. | Unsupported in this foundation | `LOON_ROUTE_NO_RESOLVE_UNMODELED` | [ip_rule.md#L19-L25](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L19-L25) |
| FINAL | `final,policy` is the fallback after no rule matches. | `FinalRouteIR.target` is exact for DIRECT, REJECT, or a compiled strategy. | Supported | - | [final_rule.md#L1-L4](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/final_rule.md#L1-L4) |
| no-resolve | With the flag, only an already-IP destination matches; a domain is not DNS-resolved for the IP rule. | `TrafficMatcherIR` has no resolve/no-resolve intent and no existing target-neutral convention. Never add it to every CIDR rule and never drop an explicit future intent. | Unproven | `LOON_ROUTE_NO_RESOLVE_UNMODELED` | [ip_rule.md#L19-L25](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/ip_rule.md#L19-L25) |
| Port | Loon has `DEST-PORT` and `SRC-PORT`, including ranges and open intervals. | `PortMatcherIR` carries only one number and no direction/range. Treat it as destination-only only if the existing Universal contract is explicitly documented; source/range forms block. | Conditional | `LOON_PORT_MATCHER_UNSUPPORTED` | [port_rule.md#L1-L18](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/port_rule.md#L1-L18) |
| Logical rules | Loon supports nested `AND`, `OR`, and `NOT`. | IR has no logical matcher tree. | Unsupported | `LOON_LOGICAL_RULE_UNSUPPORTED` (reserved) | [logic_rule.md#L1-L27](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/logic_rule.md#L1-L27) |
| Protocol / URL / User-Agent | Loon has protocol rules and HTTP URL/UA rules. | No corresponding Universal matcher types. | Unsupported | `LOON_MATCHER_UNSUPPORTED` | [protocol_rule.md#L1-L8](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/protocol_rule.md#L1-L8), [http_rule.md#L1-L12](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/http_rule.md#L1-L12) |
| Arbitrary Rule Set / remote list | A Loon rule subscription carries a URL and policy, and each downloaded line must use Loon-supported rule syntax. | `RuleSourceIR` may contain a user-controlled URL and format whose ownership, canonical grammar, request behavior, refresh behavior, and failure semantics are not proven. Never treat an arbitrary `.list` as an owned Service Rule. | Unproven | `LOON_RULE_SOURCE_FORMAT_UNPROVEN` | [Current Remote Rule page source](https://github.com/Loon0x00/Loon0x00.github.io/blob/65292c2089fb3fd8b43a8dfbeeaa5f286d7cc737/docs/Rule/sub_rule.md#L5-L10) |
| First-party Service Rules | Loon documents remote rule collections, and its full-profile example uses `[Remote Rule]` with `URL,policy=PROXY,enabled=true`. | Resolve only the ten owned `kure29/proxyflow-rules/rules/loon/*.list` assets from the central catalog, lower each service reference to a typed `LoonRemoteRule`, and serialize no extra remote options. Missing, legacy China, ordering, and policy-conflict cases fail closed. | Foundation and deterministic acceptance passed; OpenAI import, fetch/refresh, policy binding, and traffic passed on Loon `3.5.0 (975)`. Other services were not individually client-tested; ordering and failure/cache boundaries remain. | `LOON_SERVICE_RULE_NOT_FOUND`, `LOON_LEGACY_SERVICE_RULE_UNSUPPORTED`, `LOON_SERVICE_RULE_SOURCE_MISSING`, `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`, `LOON_SERVICE_RULE_POLICY_CONFLICT` | [generated Loon matrix](https://github.com/kure29/proxyflow-rules/blob/27d38e44282115e071d19c846c17e14e6d2e584b/scripts/generate-rules.mjs#L129-L209), [validator](https://github.com/kure29/proxyflow-rules/blob/27d38e44282115e071d19c846c17e14e6d2e584b/scripts/validate-rules.mjs#L161-L218), [Loon example](https://github.com/Loon0x00/LoonExampleConfig/blob/dfbfc0b74dd689d9d76d5b6da7fe3778791c0710/example.conf#L101-L105) |
| Rule order | Loon gives domain/IP rules special matching behavior and otherwise uses configuration order. | Universal routes carry explicit priority/insertion order. Sorting by matcher type is forbidden. Pure domain-family and pure IP-family sets preserve Universal priority; mixed family precedence is not proven. | Conditional | `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for active mixed domain/IP routes | [rule.md#L5-L11](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/rule.md#L5-L11) |

The route compiler preserves Universal priority order for every emitted pure
family and never sorts by matcher type. The compatibility layer rejects an
active profile containing both a domain-family matcher and an IP-family
matcher. `FINAL` is independent of this check and remains the final emitted
rule. The serializer uses the official example spellings `geoip` and `final`
for those two rule tokens while retaining uppercase internal model types. A
real-client precedence fixture is required before mixed-family routes can be
admitted.

Service matcher lowering follows a separate typed pipeline:

```text
Universal IR service matcher -> first-party Loon asset resolver
    -> LoonRemoteRule -> deterministic [Remote Rule] serializer
```

The owned matrix contains `OpenAI.list`, `Claude.list`, `Google.list`,
`Gemini.list`, `YouTube.list`, `Netflix.list`, `Disney.list`, `Telegram.list`,
`GitHub.list`, and `Steam.list`. Each is generated from the same canonical
service JSON as the other rule targets; China is intentionally absent. Exact
duplicate URL-plus-policy references are deduplicated. Reusing one asset with
different policies blocks with `LOON_SERVICE_RULE_POLICY_CONFLICT`.

Section precedence is not inferred. A service route combined with a non-service
local matcher, or multiple service routes resolving to different effective
policies, blocks with `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`. Multiple
owned service assets may be emitted when they all resolve to the same policy;
`FINAL` is not considered a conflicting local matcher. This does not prove
ordering between `[Rule]` and `[Remote Rule]`, disjointness between service
assets, or arbitrary interleaving by Universal priority.

The accepted real-client scenario uses one compatible endpoint, the OpenAI
asset, `policy=Service Proxy`, and `FINAL -> DIRECT` on Loon `3.5.0 (975)`. The
configuration imported, the untagged Remote Rule was recognized and refreshed,
the policy binding resolved, and OpenAI plus unmatched traffic behaved as
expected. `Local Rules: 0` is correct for this profile because the external list
stays under `[Remote Rule]`; it is not expanded into local `[Rule]` entries.
This evidence does not relax either ordering blocker above.

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

First-party Service Rules are not `RemoteProxySourceIR` and are not the arbitrary
`rule-set` path. At audited `proxyflow-rules` commit `27d38e4`, the ten
`sources/services/*.json` documents deterministically generate a policy-free
Loon LIST matrix under `rules/loon/`; validation checks the exact file matrix,
generated bytes, and semantic parity. ProxyFlow resolves those owned assets
through the central service catalog and emits their public `main` URLs so the
resource remains externally updateable. It does not copy rule bodies, fetch the
URLs during compilation, or accept a user-controlled substitute.

The current first-party Loon docs and full-profile example directly support the
least expressive typed form:

```ini
[Remote Rule]
https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/OpenAI.list,policy=Proxy,enabled=true
```

The compiler does not emit `tag`, `interval`, `update-interval`, `format`,
`behavior`, `path`, or `type`. A service missing from the IR, a legacy China
reference, or a catalog entry without an owned Loon asset respectively reports
`LOON_SERVICE_RULE_NOT_FOUND`, `LOON_LEGACY_SERVICE_RULE_UNSUPPORTED`, or
`LOON_SERVICE_RULE_SOURCE_MISSING`. Arbitrary remote rule lists remain blocked
by `LOON_RULE_SOURCE_FORMAT_UNPROVEN`. Real-client import, resource download,
refresh, policy binding, and traffic have passed for the audited OpenAI asset.
HTTP method/headers/authentication, automatic refresh cadence, long-duration
download/refresh failure, malformed-list/parse failure, offline cache
persistence, and direct client evidence for the other nine assets remain
unproven; implementation does not turn those unknowns into capability claims.

## Serialization and determinism

The serializer must produce UTF-8, LF line endings, deterministic section and
entry order, and exactly one trailing newline. The target baseline uses
`[General]`, `[Proxy]`, `[Proxy Group]`, `[Rule]`, and `[Remote Rule]` in that
order. `[General]`, group, rule, and Remote Rule evidence is explicit in the
audited pages or first-party full-profile example, while the node examples
imply `[Proxy]` and the readiness record includes one successful core client
import. The current minimal, untagged Remote Rule form has also passed its
separate OpenAI client acceptance. Section names are based on Loon sources, not
copied from Surge field semantics ([`general.md`](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/general.md#L1-L20), [`policygroup.md`](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/policygroup.md#L1-L6), [`plugin.md`](https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn/plugin.md#L18-L33)).

`LoonRemoteRule` is a typed model with `url`, `policy`, and literal
`enabled: true`; it is not an arbitrary serialized line. Its URL must be an
absolute HTTPS URL with no credentials, comma, quote, backslash, whitespace, or
control characters. Its policy passes through the same safe policy-reference
grammar used by local rules and groups. The serializer emits exactly
`URL,policy=<policy>,enabled=true` and never quotes, escapes, renames, or
transliterates the policy.

The official examples are comma-delimited and quote a fixed set of passwords
and UUIDs, with one explicit comma-containing HTTP username. Neither the
historical manual nor the current page specifies a complete escape grammar
for arbitrary names or values. Foundation therefore does not invent CSV-like
quoting or backslash escapes.

There are two deliberately separate serializer boundaries:

1. **Generic raw-token grammar (unproven beyond the conservative subset).**
   Raw values must be directly representable, non-empty printable ASCII
   tokens with no comma, equals sign, quote, backslash, comment marker, or
   ambiguous outer whitespace. CR, LF, NUL, other control characters, and
   line separators fail closed with `LOON_SERIALIZER_UNSAFE_VALUE`. No generic
   quote or escape support is implemented.
2. **Fixed double-quoted literals (supported only where the first-party
   examples show the exact field form).** HTTP/HTTPS password, Shadowsocks
   password, Trojan password, Hysteria2 password, and VMess/VLESS UUID are
   represented in the target model as `LoonQuotedLiteral`. The serializer
   emits the outer quotes verbatim. The current SS2022 example directly
   proves `=` and `:` inside a quoted credential, so those characters are
   admitted in this fixed subset. A separate `http-username` grammar admits a
   comma only for the explicitly documented quoted HTTP username form. Quote,
   backslash, CR/LF/NUL, controls, Unicode, and ambiguous outer whitespace
   remain rejected because no escaping or parser behavior is proven.

Policy names and policy references use a separate syntax-safe UTF-8 grammar:
Unicode text is preserved byte-for-byte, while commas, equals, quotes,
backslashes, controls, line separators, comments, and outer whitespace remain
blocked. Other fields (server, host, path, SNI, and rule payloads) remain raw
ASCII tokens and are never automatically quoted. Serializer fixtures cover
exact lines for every fixed quoted field, the proven HTTP comma form, Unicode
policy/group references, and simple-value, comma, quote, backslash, CR/LF/NUL,
and raw Unicode rejection. The official examples prove field-specific outer
quotes, not arbitrary embedded-character escaping.

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
- `LOON_ROUTE_PRIORITY_INVALID`, `LOON_MATCHER_UNSUPPORTED`, `LOON_PORT_MATCHER_UNSUPPORTED`, `LOON_ROUTE_NO_RESOLVE_UNMODELED`, `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`, `LOON_RULE_SOURCE_FORMAT_UNPROVEN`
- `LOON_SERVICE_RULE_NOT_FOUND`, `LOON_LEGACY_SERVICE_RULE_UNSUPPORTED`, `LOON_SERVICE_RULE_SOURCE_MISSING`, `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`, `LOON_SERVICE_RULE_POLICY_CONFLICT`
- `LOON_DNS_CUSTOM_EMPTY`, `LOON_DNS_RESOLVER_ID_DUPLICATE`, `LOON_DNS_RESOLVER_DUPLICATE`, `LOON_DNS_RESOLVER_ADDRESS_INVALID`, `LOON_DNS_RESOLVER_SCHEME_MISMATCH`, `LOON_DNS_DOT_UNSUPPORTED`, `LOON_DNS_UDP_PORT_UNPROVEN`, `LOON_DNS_IPV6_UDP_UNPROVEN`, `LOON_DNS_UDP_HOSTNAME_UNSUPPORTED`, `LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED`, `LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED`, `LOON_DNS_RESOLVER_ROLE_UNSUPPORTED`, `LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED`
- `LOON_POLICY_NAME_RESERVED`, `LOON_POLICY_NAME_DUPLICATE`

Reserved until the corresponding Universal intent is modeled and proven:

- `LOON_PROXY_UDP_INTENT_UNSUPPORTED`, `LOON_STRATEGY_UNSUPPORTED`, `LOON_FALLBACK_MAX_TIMEOUT_UNSUPPORTED`
- `LOON_LOAD_BALANCE_RANDOM_UNSUPPORTED`, `LOON_LOGICAL_RULE_UNSUPPORTED`
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
- a formal, tested Loon escaping grammar;
- direct real-client evidence for Service Rules other than OpenAI;
- Remote Rule HTTP method/headers/authentication and automatic refresh cadence;
- long-duration download/refresh failure, malformed-list/parse failure, and
  offline cache persistence;
- local-vs-remote precedence and different-policy Remote Rule ordering.

Until those requirements are proven and modeled, the corresponding rows remain
fail-closed. No Project schema migration, automatic Loon exposure, version
bump, release, or runtime behavior change is implied by this document.

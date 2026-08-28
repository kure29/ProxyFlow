# Surge Compiler

The Surge backend follows the same target-neutral pipeline as the other compilers:

```text
Graph → Universal IR → Semantic Validation → Surge Compatibility → Surge Model → Serializer
```

Surge-specific syntax and capability decisions stay in `src/targets/surge`. Surge is a supported production target within the documented, fail-closed capability subset. Real Surge client import and proxy-traffic acceptance passed; see `docs/surge-acceptance.md`.

## Current capability matrix

| Feature | Status | Exact subset or reason | Diagnostic |
| --- | --- | --- | --- |
| General Network / VIF (G1 + G3-B) | Supported subset | One Output-owned `general-network` family emits explicitly authored `ipv6`, `ipv6-vif`, `icmp-forwarding`, `tun-excluded-routes`, and `tun-included-routes`; route drafts canonicalize host bits at authoring, while persisted/runtime boundaries require strict canonical CIDRs. IPv6 routes require `ipv6-vif=auto` or `always`; proper specificity overlap is retained and exact same-prefix cross-list conflicts fail closed. | `SURGE_TARGET_NATIVE_GENERAL_INVALID` / `SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH` / `SURGE_GENERAL_VIF_CIDR_INVALID` / `SURGE_GENERAL_VIF_CROSS_LIST_CONFLICT` |
| General Connectivity (G2) | Supported | Output-owned typed `internet-test-url` controls Surge Internet/DIRECT connectivity testing. It is Surge-native and omitted values preserve Surge defaults; it is separate from strategy health-check URLs. | `SURGE_TARGET_NATIVE_GENERAL_INVALID` / `SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH` |
| DNS-native `always-real-ip` (G3-A) | Supported subset | DNS-node-owned typed positive-domain Host List patterns are emitted as one `[General] always-real-ip` list. The compiler binds the record to the effective enabled DNS node; non-Surge targets fail closed. | `SURGE_TARGET_NATIVE_DNS_INVALID` / `SURGE_TARGET_NATIVE_DNS_OWNER_MISMATCH` / `TARGET_NATIVE_DNS_UNSUPPORTED` |
| Service Rules | Supported | Ten branded services use their first-party Surge `.list` assets through `RULE-SET`. | — |
| SRC-PORT | Target-native | Exact single source-port matcher is emitted as `SRC-PORT,<port>,<policy>` for the documented Surge baseline (iOS 5.22+ / Mac 6.9+). Ranges and comparison expressions remain deferred; other targets fail closed because no equivalent is proven. | `TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED` |
| Remote Proxy Source | Unsupported natively | `policy-path` accepts Surge policy lines or a Surge profile. Universal IR does not retain a contract proving either format. Auto materializes a validated snapshot; Remote fails. | `SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN` |
| Select | Supported | Explicit policy order and nested policy-group references are preserved. | — |
| URL Test | Conditional | Explicit members, result-validity `interval`, millisecond `tolerance`, and the strict shared global test-URL subset are supported. | `SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED` |
| Fallback | Conditional | Ordered first-available selection and result-validity `interval` are supported. Fallback tolerance is not. | `SURGE_FALLBACK_TOLERANCE_UNSUPPORTED` |
| Fixed Strategy | Supported | A one-member `select` group preserves the independent strategy name for routes and nested candidates. | — |
| Load Balance / round-robin | Unsupported | Surge non-persistent load balance chooses uniformly at random; ProxyFlow round-robin requires an ordered cycle. | `SURGE_LOAD_BALANCE_ROUND_ROBIN_UNSUPPORTED` |
| Load Balance / consistent-hash | Unsupported | Surge persistence hashes the full target hostname. ProxyFlow currently carries Mihomo consistent-hashing semantics, whose domain key uses top-level-domain matching. | `SURGE_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED` |
| Proxy Chain | Conditional | Chain-local derived groups use group-level `underlying-proxy`. Every downstream group must contain direct policies, and port hopping cannot be combined with an underlying policy. | `SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED` |
| DNS | Conditional | Automatic target defaults, System/IPv4 UDP default resolvers, and pure DoH/DoT default resolver sets are exact. Role-specific, mixed traditional/encrypted, malformed, and traditional IPv6-upstream semantics fail closed. | `SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED` |
| VMess | Unsupported | Universal IR does not retain explicit `vmess-aead` intent, so the compiler does not guess. | `SURGE_PROXY_PROTOCOL_UNSUPPORTED` |
| VLESS | Unsupported | Current official Surge policy formats do not provide a lossless VLESS policy. | `SURGE_PROXY_PROTOCOL_UNSUPPORTED` |

The executable copy of this matrix is `src/targets/surge/capabilities.ts`; its test prevents the backend documentation from silently losing a decision or diagnostic.

## Remote source decision

Surge `policy-path` is not a general Clash/Mihomo subscription parser. It accepts either policy lines equivalent to entries in `[Proxy]`, or a full Surge profile from which Surge reads `[Proxy]`.

`RemoteProxySourceIR` currently retains the URL, request profile, export mode, and validated snapshot identity. It does not retain a remote content-format contract. Therefore:

- Auto uses the validated materialized snapshot and emits explicit `[Proxy]` policies.
- Remote fails with `SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`; it never silently materializes.
- Materialized uses the snapshot and emits explicit policies.
- Processing continues through the existing ProxySet materializer. Filter/Rename intent is never translated into `policy-regex-filter` or other target-specific guesses.

No Project or IR schema was expanded for this phase.

## Proxy Chain

Surge defines `Exit` with `underlying-proxy=Entry` as (group-level support requires Surge iOS 5.22.0+ or Surge Mac 6.9.0+):

```text
client → Entry → Exit → destination
```

For `[A, B, C]`, the compiler keeps the original A/B/C groups untouched, derives a chain-local copy of B with `underlying-proxy=A`, then derives a chain-local copy of C with the previous derived B group as its underlying policy. The final derived group carries the Chain strategy name; intermediate names are stable, readable, and collision-safe.

Group-level `underlying-proxy` applies to direct policy members, but not to nested policy groups. Consequently the first hop may be any compiled non-chain group, while every later hop must have direct proxy members. A downstream Hysteria 2 policy with port hopping is rejected because Surge forbids combining port hopping with an underlying policy. A chain may be a route target or a nested strategy candidate, but a chain cannot itself be used as another chain hop in this proven subset.

## Health checks

The compiler never emits the obsolete group-level `url=` field. Surge selects a policy test URL from policy-level `test-url`, then global `proxy-test-url`, then its default.

ProxyFlow's health URL is group-scoped. It is lowered to global `proxy-test-url` only when every URL Test/Fallback strategy has the same explicit URL and the profile has no Select/Fixed testing surface, target-native Smart group, or Subnet group with direct proxy references that the global value could also affect. Conflicting URLs, missing URLs in another testing group, or another testing surface fail closed. A target-native Subnet reference to a covered Universal URL Test/Fallback strategy is not itself a new surface. The compiler does not clone shared proxies to inject per-policy URLs.

For URL Test and Fallback, `intervalSeconds` maps to Surge `interval`, whose official meaning is test-result validity/lazy retest rather than a guaranteed background timer. URL Test `toleranceMs` maps to millisecond `tolerance`, including zero. Fallback has no equivalent tolerance field and remains fail-closed.

## Internet/DIRECT connectivity testing (G2)

`internet-test-url` (documented in Surge's [General section](https://manual.nssurge.com/profile/general.html)) is a Surge-native, concrete Output-owned setting. It is used by Surge's Internet connectivity checks and as the testing URL for DIRECT. It is not a strategy health-check URL and it is not Universal `HealthCheckIR.url`; the latter remains the sole owner of `proxy-test-url` lowering. The two keys may therefore appear together in `[General]` with independent values.

The setting is retained on an Output when its client changes. A non-Surge compilation with retained Surge intent fails closed rather than silently dropping or mapping it to another target's health-check field. Switching the same Output back to Surge restores the authored URL. An unset value emits no `internet-test-url` key and does not materialize Surge's documented default.

`test-timeout` remains Deferred and is not implemented. No real-device G2 verification has been performed; the current coverage is typed-boundary, graph/provenance, compatibility, and serializer/compiler tests.

## VIF route control (G3-B)

`tun-excluded-routes` and `tun-included-routes` extend the existing
Output-owned `targetNativeSurgeGeneralNetwork` family. They are Surge VIF
controls, not Universal routing or DNS state, and are never mapped to Mihomo,
sing-box, Loon, or Shadowrocket. Retained intent therefore remains visible and
read-only on another Output target and blocks that target's export until it is
removed or the Output returns to Surge.

The shared browser-safe CIDR helper performs authoring normalization (including
host-bit masking and lowercase IPv6 spelling), order-preserving first-occurrence
deduplication, and safety bounds (512 items, 64 bytes per item, 32 KiB per
list, 64 KiB combined). Persisted Config and runtime IR require canonical
network-prefix spelling and uniqueness; ConfigToIR only clones and binds the
compiler-owned Output id and performs no normalization or repair. IPv6 routes
require `ipv6-vif=auto` or `always`; `ipv6=true` is not required. More-specific
included routes may intentionally overlap broader excluded routes, while an
exact same canonical prefix in both lists is rejected. Included broad RFC1918
ranges receive a non-blocking warning; narrower private routes do not. Surge's
recommended `skip-proxy` pairing remains future G3-C work and is not created or
modified here.

## DNS-native `always-real-ip` (G3-A)

Surge's `[General] always-real-ip` Host List controls Fake-IP DNS behavior: matching query domains are forwarded to upstream DNS for a real routable answer. It does not select a resolver, change routing, bypass a proxy, or alter Universal `DnsIR`. The intent is therefore stored on the DNS graph node and lowered only by the Surge compiler.

Persisted Project Config is the exact record `{ target: 'surge', kind: 'dns-behavior', alwaysRealIp: string[] }`; compiler IR adds the compiler-owned `dnsNodeId`. Config cannot self-authorize an owner and empty records are rejected. Graph extraction resolves the canonical effective enabled DNS owner, scans and validates every persisted active `targetNativeSurgeDnsBehavior` field, and binds only the effective owner's valid Config to that ID. `universalDnsMode = none`, `automatic`, and `custom` are independent of this extension; a DNS owner may produce native behavior while `ir.dns` is undefined. Disabled DNS nodes retain intent but are inert, and misplaced fields fail closed.

The supported positive-domain subset is deliberately narrow: `*` and `?` wildcards, ordinary dot-separated labels, and labels containing ASCII letters, digits, `-`, `*`, or `?` (maximum 63 characters per label and 253 characters overall). Blank items, controls, commas, whitespace, empty labels, leading/trailing hyphens, IP literals, negative entries, ports, CIDRs, IP ranges, and other generic Host List tokens are rejected. Surrounding whitespace is trimmed at draft parsing; authored pattern spelling and wildcard semantics are otherwise preserved. Exact duplicates are removed only while committing the UI draft; strict persisted Config and runtime IR guards require already-unique patterns.

Surge lowering emits exactly one typed `always-real-ip` General entry when intent exists. General-key collision detection remains authoritative, so no last-wins duplicate can be serialized. Retained intent is visible in the DNS Workspace when another target is selected, where it is read-only with an explicit remove action; switching back to Surge restores it. Invalid multiline drafts never overwrite the last valid Project value, while a blank committed draft removes the field. No real-device Surge verification is claimed; tests cover the typed boundaries, graph ownership, target compatibility, UI draft behavior, General model, and serializer output.

## DNS semantic audit and lowering

Universal `automatic` DNS means that no explicit Universal upstream resolver set is selected and the target adapter owns its automatic/default behavior. Mihomo and sing-box already choose different target defaults. For Surge, omitting both DNS keys is exact: Surge then uses its operating-system DNS behavior. Undefined DNS and `enabled: false` also emit no DNS key, but remain distinct IR states from an explicitly enabled custom System resolver.

`custom` carries an explicit resolver collection. An omitted resolver role follows the existing Universal adapter convention and is treated as `default`. `direct` and `fallback` are retained intent discriminators with exact Mihomo mappings, but Surge has no equivalent global role. They are never widened into the global resolver list. Resolver `name` is presentation metadata and is not emitted.

| Universal DNS intent | Condition | Surge output | Status |
| --- | --- | --- | --- |
| undefined / disabled | Any resolver payload is inactive | No DNS key | Supported |
| automatic | Enabled, no explicit upstream contract | No DNS key | Supported |
| System default | Address absent, blank, or the existing canonical `system` sentinel | `dns-server = system` | Supported |
| UDP default | Strict IPv4 literal, optional port `1..65535` | `dns-server = …` | Supported |
| UDP default over IPv6 | Valid IPv6 literal or bracketed IPv6 with port | No output | Unsupported until Universal IR can authorize Surge's broader IPv6 behavior |
| DoH default | Absolute safe `https://` URL | `encrypted-dns-server = …` | Supported |
| DoT default | `tls://host[:port]`, without credentials, path, query, or fragment | `encrypted-dns-server = …` | Supported |
| Mixed DoH + DoT defaults | All entries remain peer encrypted resolvers | One ordered `encrypted-dns-server` list | Supported |
| Direct / Fallback role | Any transport | No output | Unsupported; role cannot be preserved |
| Traditional + encrypted defaults | Any System/UDP plus any DoH/DoT | No output | Unsupported; Surge changes traditional resolvers into bootstrap/connectivity-only inputs |

Plain UDP hostnames are rejected; the compiler never resolves them at build time. The target-local validator handles IPv4, IPv6, bracketed IPv6-plus-port, port bounds, outer whitespace normalization, and injection characters without splitting on `:`. Kind/scheme mismatches are separate from malformed-address diagnostics. A System resolver accepts the canonical `address: 'system'` used by the existing Project preset in addition to absent or blank address, but rejects any other payload.

Surge queries each traditional list and each encrypted list concurrently, with the first answer winning. Resolver order therefore is not priority, but is retained for byte-stable output. Duplicate resolver IDs fail because they make IR references ambiguous. Identical traditional runtime endpoints keep the first occurrence, matching Surge's documented duplicate suppression. Identical encrypted endpoints fail closed because the official encrypted-DNS documentation does not define duplicate behavior.

Traditional and encrypted defaults cannot be emitted together. Once `encrypted-dns-server` exists, Surge uses traditional DNS only for connectivity checks and encrypted-server hostname bootstrap, rather than as peer resolvers for ordinary domains. The compiler reports `SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED` instead of producing a loadable but semantically different profile.

Surge drops IPv6 entries from `dns-server` while `ipv6=false`; `ipv6` defaults to false. Emitting `ipv6=true` solely for a DNS upstream would also enable full IPv6 and AAAA behavior that Universal DNS IR does not express, so traditional IPv6 upstreams fail with `SURGE_DNS_IPV6_RESOLVER_UNMODELED`. This guard does not apply to an IPv6 literal used as an encrypted URL endpoint. That boundary is an inference from two scoped official statements: the drop rule is specific to `dns-server`, while direct IPv6 literals remain reachable when full IPv6 hostname support is disabled.

The typed General model distinguishes scalar `proxy-test-url` from token-list `dns-server` and `encrypted-dns-server`. Health is composed before DNS in deterministic order, and both the composer and serializer prevent duplicate case-insensitive General keys. List items are serialized individually, so a DNS list is not accidentally quoted as one scalar value.

The phase intentionally does not emit `hijack-dns`, `allow-dns-svcb`, `[Host]`, per-domain/SSID DNS, scripts, DoH3, DoQ, DNS-over-TCP, outbound-following, or certificate-verification overrides. Fake-IP and `MihomoDnsMode` remain target-specific and do not enter the Surge compiler.

Stable DNS diagnostics include:

- `SURGE_DNS_CUSTOM_EMPTY`
- `SURGE_DNS_DIRECT_RESOLVER_UNSUPPORTED`
- `SURGE_DNS_FALLBACK_RESOLVER_UNSUPPORTED`
- `SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED`
- `SURGE_DNS_RESOLVER_ADDRESS_INVALID`
- `SURGE_DNS_RESOLVER_SCHEME_MISMATCH`
- `SURGE_DNS_UDP_HOSTNAME_UNSUPPORTED`
- `SURGE_DNS_IPV6_RESOLVER_UNMODELED`
- `SURGE_DNS_RESOLVER_ID_DUPLICATE`
- `SURGE_DNS_RESOLVER_DUPLICATE`
- `SURGE_GENERAL_KEY_DUPLICATE`

## Minimum supported Surge version

The recommended baseline for the complete currently implemented backend is Surge iOS 5.22.0+ or Surge Mac 6.9.0+. The highest documented requirement comes from Phase 2 group-level `underlying-proxy`; the Phase 3 System/UDP/DoH/DoT DNS subset does not raise it. The Surge target UI displays this minimum and intentionally exposes no version selector.

## Protocol audit

| Protocol | Status | Notes |
| --- | --- | --- |
| HTTP / HTTPS | Supported subset | Paired username/password; TLS SNI, certificate verification flag, and ALPN are preserved. |
| SOCKS5 | Supported subset | Normalized UDP-capable endpoint intent emits the Surge-required `udp-relay=true`. |
| Shadowsocks | Supported subset | Documented cipher allowlist, exact password/key validation, native simple-obfs http/tls lowering, and `udp-relay=true`; other plugin or option semantics fail closed. |
| Trojan | Supported subset | Password, TLS, and TCP/WebSocket fields are preserved. Other transports fail closed. |
| VMess | Unsupported | Explicit `vmess-aead` intent is absent from Universal IR. |
| VLESS | Unsupported | No current official lossless Surge policy. |
| Hysteria 2 | Supported subset | Password, download bandwidth, fixed port-hopping interval, and TLS are preserved; upload bandwidth, ranged interval, and non-portable obfuscation fail closed. |
| TUIC | Supported subset | Emits documented TUIC v5 UUID/password/TLS fields; explicit congestion-control and UDP-relay-mode intent fail closed. |
| AnyTLS | Supported subset | Password/TLS and native UDP behavior are preserved; explicit UDP disable and unsupported idle-session tuning fail closed. |

Unconsumed parser Partial metadata, client fingerprints, Reality, unsupported transports, or fields without a Surge equivalent stop compilation instead of being dropped. Exact simple-obfs metadata is consumed by the native lowering path.

## Official references

- [DNS Overview](https://manual.nssurge.com/dns/overview.html)
- [DNS Servers](https://manual.nssurge.com/dns/dns-server.html)
- [Encrypted DNS](https://manual.nssurge.com/dns/encrypted-dns.html)
- [Advanced DNS Topics](https://manual.nssurge.com/dns/advanced.html)
- [General Section](https://manual.nssurge.com/profile/general.html)
- [Policy Including](https://manual.nssurge.com/policy-groups/policy-including.html)
- [Common Group Parameters](https://manual.nssurge.com/policy-groups/parameters.html)
- [Common Policy Parameters](https://manual.nssurge.com/policies/parameters.html)
- [URL Test](https://manual.nssurge.com/policy-groups/url-test.html)
- [Fallback](https://manual.nssurge.com/policy-groups/fallback.html)
- [Load Balance](https://manual.nssurge.com/policy-groups/load-balance.html)
- [Policies Overview](https://manual.nssurge.com/policies/overview.html)
- [Source and Port Rules](https://manual.nssurge.com/rules/source-and-port.html)
- [VMess](https://manual.nssurge.com/policies/vmess.html)
- [UDP](https://manual.nssurge.com/policies/udp.html)
- [HTTP](https://manual.nssurge.com/policies/http.html)
- [SOCKS5](https://manual.nssurge.com/policies/socks5.html)
- [Shadowsocks](https://manual.nssurge.com/policies/shadowsocks.html)
- [Trojan](https://manual.nssurge.com/policies/trojan.html)
- [Hysteria 2](https://manual.nssurge.com/policies/hysteria2.html)
- [TUIC](https://manual.nssurge.com/policies/tuic.html)
- [AnyTLS](https://manual.nssurge.com/policies/anytls.html)

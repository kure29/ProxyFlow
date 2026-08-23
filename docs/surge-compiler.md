# Surge Compiler

The Surge backend follows the same target-neutral pipeline as the other compilers:

```text
Graph → Universal IR → Semantic Validation → Surge Compatibility → Surge Model → Serializer
```

Surge-specific syntax and capability decisions stay in `src/targets/surge`. The currently proven backend subset is complete and exposed as a release-candidate product target with fail-closed compatibility checks. Real Surge client import acceptance is still pending; see `docs/surge-acceptance.md`.

## Current capability matrix

| Feature | Status | Exact subset or reason | Diagnostic |
| --- | --- | --- | --- |
| Service Rules | Supported | Ten branded services use their first-party Surge `.list` assets through `RULE-SET`. | — |
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

ProxyFlow's health URL is group-scoped. It is lowered to global `proxy-test-url` only when every URL Test/Fallback strategy has the same explicit URL and the profile has no Select/Fixed testing surface that the global value could also affect. Conflicting URLs, missing URLs in another testing group, or another testing surface fail closed. The compiler does not clone shared proxies to inject per-policy URLs.

For URL Test and Fallback, `intervalSeconds` maps to Surge `interval`, whose official meaning is test-result validity/lazy retest rather than a guaranteed background timer. URL Test `toleranceMs` maps to millisecond `tolerance`, including zero. Fallback has no equivalent tolerance field and remains fail-closed.

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

The phase intentionally does not emit `hijack-dns`, `always-real-ip`, `allow-dns-svcb`, `[Host]`, per-domain/SSID DNS, scripts, DoH3, DoQ, DNS-over-TCP, outbound-following, or certificate-verification overrides. Fake-IP and `MihomoDnsMode` remain target-specific and do not enter the Surge compiler.

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

The recommended baseline for the complete currently implemented backend is Surge iOS 5.22.0+ or Surge Mac 6.9.0+. The highest documented requirement comes from Phase 2 group-level `underlying-proxy`; the Phase 3 System/UDP/DoH/DoT DNS subset does not raise it. The release-candidate UI displays this minimum and intentionally exposes no version selector.

## Protocol audit

| Protocol | Status | Notes |
| --- | --- | --- |
| HTTP / HTTPS | Supported subset | Paired username/password; TLS SNI, certificate verification flag, and ALPN are preserved. |
| SOCKS5 | Supported subset | Normalized UDP-capable endpoint intent emits the Surge-required `udp-relay=true`. |
| Shadowsocks | Supported subset | Documented cipher allowlist, exact password/key validation, and `udp-relay=true`; plugins fail closed. |
| Trojan | Supported subset | Password, TLS, and TCP/WebSocket fields are preserved. Other transports fail closed. |
| VMess | Unsupported | Explicit `vmess-aead` intent is absent from Universal IR. |
| VLESS | Unsupported | No current official lossless Surge policy. |
| Hysteria 2 | Supported subset | Password, download bandwidth, fixed port-hopping interval, and TLS are preserved; upload bandwidth, ranged interval, and non-portable obfuscation fail closed. |
| TUIC | Supported subset | Emits documented TUIC v5 UUID/password/TLS fields; explicit congestion-control and UDP-relay-mode intent fail closed. |
| AnyTLS | Supported subset | Password/TLS and native UDP behavior are preserved; explicit UDP disable and unsupported idle-session tuning fail closed. |

Explicit parser Partial metadata, client fingerprints, Reality, unsupported transports, or fields without a Surge equivalent stop compilation instead of being dropped.

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
- [VMess](https://manual.nssurge.com/policies/vmess.html)
- [UDP](https://manual.nssurge.com/policies/udp.html)
- [HTTP](https://manual.nssurge.com/policies/http.html)
- [SOCKS5](https://manual.nssurge.com/policies/socks5.html)
- [Shadowsocks](https://manual.nssurge.com/policies/shadowsocks.html)
- [Trojan](https://manual.nssurge.com/policies/trojan.html)
- [Hysteria 2](https://manual.nssurge.com/policies/hysteria2.html)
- [TUIC](https://manual.nssurge.com/policies/tuic.html)
- [AnyTLS](https://manual.nssurge.com/policies/anytls.html)

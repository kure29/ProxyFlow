# Shadowrocket Compiler Foundation

Status: **registered and paused**. The backend is intentionally not exposed as
a product target. This document is the evidence-bounded capability audit for
the first compiler slice and records the gates that must be closed before
Shadowrocket can become a supported target.

The intended pipeline is:

```text
Graph → Universal IR → Semantic Validation → Shadowrocket Compatibility
     → typed Shadowrocket model → deterministic INI serializer
```

The adapter consumes Universal IR only. No Shadowrocket-specific fields were
added to Graph, Project Schema, or Universal IR.

## Evidence status

The repository environment could not retrieve Shadowrocket's public site or
documentation (the vendor site returned `ERR_CONNECTION_CLOSED` on 2026-08-25;
the App Store URL redirected to a generic regional landing page without the
product listing). No real-client observation has been supplied. Consequently
every mapping below is marked conditional, unproven, or deferred until a human
supplies a pinned source or acceptance record. The links in the evidence column
are investigation starting points, not evidence claims.

Candidate authoritative sources to pin at the human gate:

- [Shadowrocket App Store listing](https://apps.apple.com/us/app/shadowrocket/id932747118)
- [Shadowrocket help/site](https://shadowrocket.app/)
- A version-pinned in-app manual or vendor-owned configuration reference.

## Capability matrix

| Area | Shadowrocket native capability | Universal IR representation | ProxyFlow mapping decision | Status | Diagnostic | Evidence source |
| --- | --- | --- | --- | --- | --- | --- |
| HTTP / HTTPS | Native proxy profiles are believed to exist, but exact field grammar is not pinned. | HTTP endpoint, optional credentials, TLS/SNI/verification. | Emit only the typed parameter form implemented by the adapter after syntax evidence and import acceptance. | Conditional | `SHADOWROCKET_PROXY_VARIANT_UNPROVEN` | Vendor syntax + import acceptance required |
| SOCKS5 | Native support is reported by ecosystem clients; exact UDP/auth keys are not pinned. | SOCKS5 endpoint and optional credentials. | Keep auth; do not infer UDP relay or SOCKS version extensions. | Conditional | `SHADOWROCKET_PROXY_VARIANT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| Shadowsocks | Native family is expected; complete cipher/plugin grammar is not pinned. | Method, password, opaque plugin metadata. | Allow only the audited method and simple-obfs subset; all other plugin/options fail closed. | Conditional | `SHADOWROCKET_SHADOWSOCKS_CIPHER_UNPROVEN`, `SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN` | Vendor syntax + import/traffic acceptance required |
| Shadowsocks 2022 | Native support is unproven in this environment. | Method and password/key string. | No key-length inference; explicit key evidence is required before support. | Unproven | `SHADOWROCKET_SHADOWSOCKS_CIPHER_UNPROVEN` | Vendor syntax required |
| VMess | Native support and exact parameter names are unproven. | UUID, security, alterId, TLS, transport. | Emit only explicit fields; partial parser metadata blocks. | Conditional | `SHADOWROCKET_PROXY_VARIANT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| VLESS | Native support and exact parameter names are unproven. | UUID, encryption/security, flow, TLS, transport. | Reality/Vision/flow intent fails closed until independently proven. | Conditional | `SHADOWROCKET_REALITY_UNPROVEN` | Vendor syntax + traffic acceptance required |
| Trojan | Native support is unproven. | Password, TLS, transport. | TCP/WebSocket subset only; no guessed TLS behavior. | Conditional | `SHADOWROCKET_PROXY_VARIANT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| Hysteria2 | Native support is unproven. | Password, TLS, obfs, bandwidth, port hopping. | Password/TLS model exists; obfs, bandwidth, and hopping remain blocked. | Conditional | `SHADOWROCKET_HYSTERIA2_VARIANT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| TUIC | Native support is unproven. | UUID/password, TLS, congestion and relay mode. | UUID/password/TLS model exists; explicit congestion/relay intent blocks. | Conditional | `SHADOWROCKET_TUIC_VARIANT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| AnyTLS | Native support is unproven. | Password, TLS, UDP and idle-session fields. | Password/TLS only; explicit UDP disable/session tuning blocks. | Conditional | `SHADOWROCKET_ANYTLS_VARIANT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| TLS / SNI | Exact key spelling, ALPN and certificate semantics are unproven. | TLS enabled, SNI, verification, ALPN, fingerprint, Reality. | SNI/skip-cert-verify are emitted only for the audited subset; fingerprint, Reality, disable-SNI fail closed. | Conditional | `SHADOWROCKET_TLS_VARIANT_UNPROVEN` | Vendor syntax required |
| WebSocket | Exact parameter names and header/path semantics are unproven. | WS path/host/early-data. | Path/Host model exists; early data and non-WS transports fail closed. | Conditional | `SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN` | Vendor syntax + traffic acceptance required |
| gRPC / HTTP2 / HTTPUpgrade / XHTTP | No evidence pinned. | Explicit transport variants exist in IR. | Unsupported; never silently downgrade to TCP. | Unsupported | `SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN` | No pinned evidence |
| Select/manual | Group semantics are unproven. | Select strategy with ordered candidates. | Serialize as `select` only after import/selection acceptance. | Conditional | `SHADOWROCKET_STRATEGY_UNPROVEN` | Vendor group syntax + client acceptance |
| URL test / auto-select | Health-test keys and scope are unproven. | URL, interval, tolerance. | Serialize explicit health fields; fallback tolerance remains blocked. | Conditional | `SHADOWROCKET_STRATEGY_TEST_URL_INVALID`, `SHADOWROCKET_FALLBACK_TOLERANCE_UNPROVEN` | Vendor group syntax + client acceptance |
| Fallback | Native group type is unproven. | Ordered fallback candidates and health check. | Conditional; preserve order, reject unproven tolerance semantics. | Conditional | `SHADOWROCKET_STRATEGY_UNPROVEN` | Vendor group syntax + client acceptance |
| Load balance | Algorithm and persistence semantics are unproven. | Round-robin/consistent-hash mode. | Serialize explicit mode only after algorithm acceptance; no default guessing. | Conditional | `SHADOWROCKET_STRATEGY_UNPROVEN` | Vendor group syntax + client acceptance |
| Fixed policy | No independent fixed group is proven. | Fixed proxy strategy. | Lower to one-member select group. | Conditional | `SHADOWROCKET_STRATEGY_UNPROVEN` | Import/selection acceptance |
| Proxy chain | Hop order/underlying-proxy semantics are unproven. | Ordered chain hops. | Fail closed; no target-specific chain fields or downgrade. | Unsupported | `SHADOWROCKET_PROXY_CHAIN_UNPROVEN` | No pinned evidence |
| DOMAIN / SUFFIX / KEYWORD | Rule spellings are unproven. | Domain matcher variants. | Preserve Universal priority/insertion order; require precedence acceptance. | Conditional | `SHADOWROCKET_ROUTE_ORDER_UNPROVEN` | Vendor rule syntax + precedence acceptance |
| IP-CIDR / IP-CIDR6 / GEOIP | Rule spellings and DNS resolution behavior are unproven. | CIDR and country matchers. | Emit only after syntax and no-resolve semantics are proven; current adapter has no no-resolve inference. | Conditional | `SHADOWROCKET_ROUTE_ORDER_UNPROVEN` | Vendor rule syntax + precedence acceptance |
| Port / ASN / GEO-SITE | IR lacks direction/range/no-resolve semantics or target proof. | Port, ASN, geosite matcher types. | Unsupported. | Unsupported | `SHADOWROCKET_MATCHER_UNSUPPORTED` | Universal IR audit |
| Rule sets / first-party Service Rules | URL, format, refresh, and failure semantics are unproven. | Rule-set reference and service sources. | Unsupported; never treat an arbitrary URL as equivalent to service intent. | Unproven | `SHADOWROCKET_RULE_SOURCE_UNPROVEN` | Vendor rule-source syntax required |
| FINAL | Fallback rule spelling is unproven. | Final route target. | Serialize only after import/routing acceptance. | Conditional | `SHADOWROCKET_TARGET_REFERENCE_NOT_FOUND` | Vendor rule syntax + acceptance |
| DNS system / UDP | Global key spelling and resolver precedence are unproven. | DnsIR system/UDP default resolvers. | Current adapter limits output to `dns-server` system/IPv4 literals. | Conditional | `SHADOWROCKET_DNS_*` | Vendor DNS syntax + DNS acceptance |
| DNS DoH / DoT | Encryption keys and bootstrap semantics are unproven. | DnsIR doh/dot. | Unsupported until evidence proves lossless mapping. | Unsupported | `SHADOWROCKET_DNS_ENCRYPTED_RESOLVER_UNPROVEN` | Vendor DNS syntax required |
| DNS direct/fallback roles | Global role mapping is unproven and DnsIR lacks richer policy rules. | Resolver role field. | Fail closed. | Unsupported | `SHADOWROCKET_DNS_ROLE_UNSUPPORTED` | Universal IR audit |
| Remote proxy sources | Native subscription format/refresh contract is unproven. | Remote source URL, request profile, export mode, snapshot. | Materialized snapshots may be compiled by the normal IR path; native remote export fails. | Unproven | `SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN` | Vendor import/refresh acceptance |
| Deterministic serializer | Target-local INI serialization is under ProxyFlow control. | IR scalar/list values and ordered entities. | Emit LF with one trailing newline, stable section/order, and reject unsafe values. | Supported (internal) | `SHADOWROCKET_SERIALIZER_UNSAFE_VALUE` | Deterministic fixture test |
| Reality / Vision | Client-native behavior is not pinned. | TLS Reality object and VLESS flow are represented in IR. | Keep the fields in Universal IR but defer Shadowrocket lowering. | Deferred | `SHADOWROCKET_REALITY_UNPROVEN` | Human evidence gate |

## Determinism and diagnostics

`src/targets/shadowrocket` owns its typed model, compatibility layer,
projection, serializers, strategy/routing/DNS lowering, and diagnostics. The
serializer rejects duplicate General keys, unsafe names/tokens, control
characters, and non-finite numbers. Route order is priority ascending with
stable IR-array tie breaking. Unsupported or unproven intent in an active
strategy is an error; rejected endpoint details remain attached to target
diagnostics even when aggregate projection statistics report skipped
endpoints. Inactive inventory is retained only as warning-level evidence. No
unsupported intent is silently omitted or downgraded.

## Acceptance gate

Before changing `productStatus` from `paused` to `supported`, a human must
provide sanitized evidence for import, representative proxy traffic, strategy
selection, routing precedence, DNS behavior, and a representative materialized
subscription. The exact generated profiles and test steps belong in
`docs/shadowrocket-acceptance.md`; no real-client result is claimed here.

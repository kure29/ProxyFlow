# Subscription format compatibility

ProxyFlow detects subscription content from its wire format and normalizes supported proxy entries into the existing target-neutral endpoint model. Every entry still passes the same semantic firewall and can be `Ready`, `Partial`, or `Unsupported` independently. A control section or one unsupported protocol does not discard other usable proxy entries.

The matrix below records the current V0.7 Phase 1 implementation. `Supported` means the format has a stable detector and the common supported endpoint subset imports end to end. `Partially Supported` means the format is detected and useful proxy definitions import, but some dialect fields or protocols are intentionally rejected. `Not Supported` means there is no safe importer for that format.

| Format | Detection | Import status | Supported protocols | Known limitations | Test coverage |
| --- | --- | --- | --- | --- | --- |
| Universal / URI | URI grammar, content-first | Supported | HTTP, SOCKS5, Shadowsocks, Trojan, VMess, VLESS, Hysteria2, TUIC, AnyTLS | Sub-Store's Universal link is not a fixed wire format: with `path: null` it omits `target`, so the backend negotiates output from `platform`, `target`, request User-Agent, then `Accept`, finally defaulting to V2Ray. Invalid links and unsupported schemes become isolated nodes | Official Sub-Store producer fixtures, URI parser, malformed entries, mixed lists, lifecycle |
| Base64 URI | Standard or URL-safe Base64 with optional padding, one decode layer | Supported | Same URI subset as above | BOM, CRLF, whitespace, Unicode names, and missing padding are normalized; size and node-count limits still apply; recursive decoding is not performed | Sub-Store V2Ray producer fixture, URL-safe and boundary decoding |
| Sub-Store JSON | Top-level JSON proxy array (`JSON.stringify(proxies)`) | Partially Supported | The same normalized proxy object subset as Mihomo/Clash | This is distinct from V2Ray JSON, sing-box JSON, and Clash/Mihomo JSON object envelopes; control fields are not guessed and unsupported protocols remain isolated | Official JSON producer shape, empty array, mixed supported/unsupported records |
| Mihomo / Clash YAML | YAML `proxies` sequence | Partially Supported | Common Mihomo proxy schema for the supported protocols above | Non-proxy sections are ignored; target-specific fields and unsupported protocol variants remain Partial or Unsupported | YAML fixtures, modern transports, AnyTLS, malformed entries |
| Mihomo / Clash JSON | JSON `proxies` sequence | Partially Supported | Same Clash-family subset | Non-proxy fields are ignored; schema variants outside the normalized model are isolated | JSON detection and parser regression |
| Stash | Clash-compatible `proxies` sequence | Partially Supported | Clash-family subset | Stash-only fields are not guessed; routing, policy, and DNS sections are ignored | Clash-family detector/parser coverage |
| Egern | YAML or JSON `proxies` with Egern-specific type/field signatures | Partially Supported | HTTP/HTTPS, Shadowsocks, Trojan, VMess, VLESS, Hysteria2, TUIC, AnyTLS where fields map losslessly | `socks5_tls` and other TLS-bearing SOCKS variants are Unsupported because the normalized SOCKS model has no TLS field; Egern-only options may be Partial | Egern YAML detection and endpoint isolation |
| Surge | Named proxy lines and `[Proxy]` sections | Partially Supported | HTTP, SOCKS5, Shadowsocks, Trojan, VMess, VLESS, Hysteria2, TUIC, AnyTLS common fields | Rules, DNS, policy groups, and unrecognized options are not imported; dialect-specific transport options may be Partial | Quoted CSV, option parsing, normalization |
| Surfboard | Proxy-line grammar and Surfboard-specific option signatures | Partially Supported | Common Surge-family lines in the supported protocol subset | Surfboard-only options such as port hopping are retained only when they map to the normalized model | Shared line parser and dialect detection |
| Loon | Loon `name=type,...` proxy lines | Partially Supported | HTTP, SOCKS5, Shadowsocks, Trojan and other common line entries in the supported subset | Loon rules, rewrite, DNS, and policy sections are ignored; unsupported protocol dialects remain Unsupported | Loon line fixture and quoted values |
| Shadowrocket | URI-family content | Supported | Same URI subset as Universal / URI | Shadowrocket-specific output is treated as URI content; client-only settings are not imported | URI detection and normalization |
| Quantumult X | `type=server:port,...,tag=name` proxy lines | Partially Supported | Common HTTP, SOCKS5, Shadowsocks, Trojan, VMess, VLESS, AnyTLS fields | Rewrite, filter, policy, and DNS sections are ignored; fields without a lossless endpoint mapping remain Partial or Unsupported | QX syntax, tags, quoted values |
| sing-box JSON | JSON `outbounds` with `type` | Partially Supported | Proxy outbounds for HTTP, SOCKS5, Shadowsocks, Trojan, VMess, VLESS, Hysteria2, TUIC, AnyTLS | `direct`, `block`, `dns`, `selector`, `urltest`, and other control outbounds are ignored; routing, inbounds, DNS, and chains are not imported | Proxy/control outbound fixtures, unsupported protocol isolation |
| V2Ray JSON | JSON `outbounds` with `protocol` | Partially Supported | Proxy outbounds for HTTP, SOCKS5, Shadowsocks, Trojan, VMess, and VLESS where settings map losslessly | Routing, inbounds, DNS, and complex chains are ignored; unsupported stream/security fields are Partial or Unsupported | VMess outbound fixture and malformed settings |
| V2Ray URI | URI-family content | Supported | Same URI subset as Universal / URI | Full V2Ray client JSON is covered separately above; URI output uses the shared URI parser | URI detector and parser coverage |

## Intentionally unsupported protocols

Format compatibility does not add proxy protocols. SSR, Snell, WireGuard, SSH, Hysteria v1, mieru, MASQUE, Tailscale, GOST, Shadow QUIC, and other protocols outside ProxyFlow's normalized model are detected as `Unsupported` entries. Other Ready entries in the same subscription remain importable. Format detection is intentionally separate from protocol support: an all-unsupported URI/Base64 feed is still identified as a URI subscription with `Detected: N`, `Ready: 0`, and `Unsupported: N`.

## Cross-format identity

Endpoint identity is derived from normalized connection semantics rather than the source format label. Equivalent fictional endpoints expressed as URI, Sub-Store V2Ray Base64, Sub-Store JSON, Mihomo/Clash, sing-box, Surge, Loon, or Quantumult X therefore remain eligible for `Unchanged`/`Changed` continuity across refreshes. Display names and source metadata may differ by dialect; server, port, authentication, TLS/SNI, transport, Reality, flow, and AnyTLS session semantics must not be silently dropped.

## Privacy boundary

Parser diagnostics contain stable issue codes and safe summaries. Credentials, UUIDs, share URIs, token-bearing subscription URLs, and raw response bodies are not included in errors, Project export, diff summaries, or the format compatibility UI. Runtime snapshots remain browser-local and are scoped by project and source.

## Universal endpoint behavior

The official Sub-Store Front-End labels the general output with `path: null`, which means the copied link does not add a `target` query parameter. The backend chooses a producer in this order: `query.platform`, `query.target`, platform inferred from request headers, then `JSON`. Its current User-Agent fallback maps known client identifiers to their producer; `Accept: application/json...` selects JSON; a generic browser request falls back to V2Ray. The V2Ray producer serializes each proxy through the URI producer, joins the URI records with newlines, and Base64-encodes the result. Therefore Universal is content-negotiated rather than a domain-specific format.

ProxyFlow records safe fetch metadata (`status`, `content-type`, declared content length when present, response byte count, and duration) alongside URL snapshots. Response bodies and source URLs remain out of diagnostics and test output.

# Shadowrocket Release-Readiness Audit

Decision: **BLOCKED BY PRODUCT GATE — target remains paused**.

The evidence-bounded compiler is engineering-ready for the exact tested subset
listed below, but that does not authorize product exposure. No engineering
`MUST FIX` remains for that scoped subset. Product exposure, versioning, and
release actions remain explicitly deferred until a human makes the next gate
decision.

## Classification matrix

Every readiness item is classified as `ADDRESSED`, `ACCEPTED LIMITATION`,
`DEFERRED`, or `MUST FIX`.

| Readiness item | Classification | Evidence / boundary |
| --- | --- | --- |
| Compiler registration | ADDRESSED | Shadowrocket is registered internally, remains `productStatus: paused`, and is excluded from `PRODUCT_TARGETS`. |
| Project lifecycle | ADDRESSED | New-project, paused target identity, persistence, hydration, target transitions, and history-safety tests cover the internal path. |
| Persistence / hydration | ADDRESSED | Project storage and builder-store round-trip/race tests cover hydration, embedded data, and stale cache protection. |
| Undo / redo | ADDRESSED | Builder-store tests cover routing edits, target switching, DNS state, and Shadowrocket target identity across undo/redo. |
| Target switching | ADDRESSED | Target-switch tests preserve graph data and paused Shadowrocket state without product exposure. |
| Preview | ADDRESSED | Preview target resolution and paused-warning behavior are tested; unsupported output remains blocked. |
| Export | ADDRESSED | Target-specific `.conf` metadata and successful-result-only export behavior are tested. |
| Health | ADDRESSED | Paused-target health and diagnostic presentation are tested; blocked results remain visible. |
| Stale-result/current-result protection | ADDRESSED | Hydration/network race tests prevent late state from overwriting newer state. |
| Diagnostics UX | ADDRESSED | Paused diagnostics, localized messaging, technical details, and fail-closed compiler errors are covered. |
| CI | ADDRESSED | CI and container workflows run type/build/deployment, deterministic Shadowrocket acceptance, and fixture-drift checks. |
| Deterministic fixtures | ADDRESSED | Checked-in fixture remains SHA-256 `dc81aa08f70797702971c85f4b256b80ad4dc10e505856ca24964d5c7f7dc5d2`; local artifacts remain disposable. |
| Capability audit | ADDRESSED | The matrix now distinguishes tested, conditional, accepted-limitation, deferred, and unsupported semantics. |
| Capability documentation | ADDRESSED | Acceptance, compiler, and RC-readiness documents record exact evidence and boundaries. |
| Vendor syntax/manual evidence | ACCEPTED LIMITATION | Public vendor references could not be pinned in this environment; the exact emitted subset is bounded by deterministic tests and build-pinned client acceptance. |
| Core import / select / traffic | ADDRESSED | Shadowrocket 2.2.65 build 2615 accepted two Shadowsocks `aes-256-gcm` members, select behavior, proxy traffic, and FINAL. |
| Materialized subscription | ADDRESSED | 2 candidates, 2 compatible, 0 skipped, 0 blockers; import, latency, and traffic passed. Native remote refresh is not implied. |
| URL-test | ADDRESSED | Exact emitted health URL/interval subset passed import, health checks, automatic selection, and traffic. |
| Fallback | ADDRESSED | Exact emitted ordered fallback subset passed timeout, healthy-member selection, and continued traffic. |
| Load-balance | ADDRESSED | Exact emitted round-robin subset passed traffic on both members; no long-term 50/50 claim is made. |
| Other protocols / advanced transports | DEFERRED | VMess, VLESS Reality/Vision, Trojan, Hysteria2, TUIC, AnyTLS, advanced transports, and untested cipher/plugin variants remain conditional or fail closed. |
| Domain-family routing | ADDRESSED | DOMAIN versus DOMAIN-SUFFIX baseline/inverted winner behavior passed for Shadowrocket 2.2.65 build 2615; no broader matcher-family claim is made. |
| Standalone IP-CIDR / GEOIP | ADDRESSED | Both standalone probes passed on Shadowrocket 2.2.65 build 2615. |
| Mixed IP-CIDR/IP-CIDR6 + GEOIP precedence | ACCEPTED LIMITATION | The tested client did not preserve the Universal winner under emitted-order inversion; compiler fails closed with `SHADOWROCKET_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`. |
| IP-CIDR6 behavior | ACCEPTED LIMITATION | Syntax/import remains available; real IPv6 behavior is `NOT RUN` without a controlled reachable IPv6. |
| FINAL | ADDRESSED | Core and standalone routing profiles observed the emitted final behavior within their tested scopes. |
| DNS system | ADDRESSED | Syntax/import and general DNS-dependent browsing passed; no specific system resolver address is claimed. |
| DNS IPv4 UDP | ADDRESSED | `1.1.1.1:53` was observed directly in Shadowrocket DNS records with successful answers and browsing. |
| DoH / DoT and richer DNS roles | ACCEPTED LIMITATION | Encrypted resolver and unproven role mappings remain unsupported and fail closed. |
| Service Rules / rule sets | ACCEPTED LIMITATION | Format, refresh, binding, and traffic semantics are not exposed; unsupported intent fails closed. |
| Native remote proxy sources | ACCEPTED LIMITATION | Materialized local snapshots are supported; native remote export/refresh remains unsupported. |
| Product exposure | DEFERRED | Do not add Shadowrocket to product exposure or change `productStatus`. |
| Version / release / publish / deploy | DEFERRED | No version bump, tag, release, publish, deploy, or merge is authorized by this goal. |

## MUST FIX count

**0** for the currently intended, evidence-bounded subset. The accepted
limitations and deferred capabilities above are deliberate boundaries, not
silent downgrades.

## Engineering readiness decision

Shadowrocket is engineering-ready only for the exact tested subset and its
documented fail-closed boundaries. It is **not authorized for product
exposure**. The target must remain registered-but-paused and PR #50 must remain
Draft.

## Exact remaining human decision

The human must decide whether to authorize a future product-exposure review for
the evidence-bounded subset, explicitly accepting the deferred protocols,
materialized-only source model, mixed IP/GEO rejection, and IPv6 behavioral gap.
Until that decision and any separate release review, keep Shadowrocket paused;
do not mark PR #50 Ready or merge it.

## Verification snapshot

On 2026-08-26, the worktree passed:

- `npm test -- --run`: 111 files / 1,159 tests
- `npx tsc -b --pretty false`
- `npm run build`
- `npm run runtime:build`
- `npm run test:deployment`: 40 checks
- `npm run shadowrocket:acceptance`
- `git diff --check`
- tracked Shadowrocket fixture drift check

These checks establish deterministic engineering behavior and do not replace
the human product-exposure decision.

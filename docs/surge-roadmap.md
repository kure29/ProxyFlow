# ProxyFlow — Surge 1.4.0 Scope and Deferred Backlog

Status: Surge 1.4 feature scope closed; real-client acceptance pending

Baseline `main`: `5b811ce8b57cc8d8e634fa39c550bb61474d99fa`

Branch: `main`

This document is the authoritative release-scope and backlog record for the
Surge export target. It is intentionally a finite planning slice: it does not
implement a Surge setting, change the compiler, or promise coverage merely
because a key exists in Surge. Repository code is authoritative for ProxyFlow
support status; the current official Surge [General] documentation is
authoritative for client semantics.

## Release philosophy

ProxyFlow 1.4.0 does **not** aim for complete Surge feature coverage. The
release goal is:

- core workflows work end-to-end;
- common/high-value General settings are modeled correctly;
- target-native ownership is explicit;
- exports fail closed when semantics are unsupported;
- there is no silent target downgrade or semantic stripping;
- existing output remains byte-stable when a feature is unset; and
- important generated configurations receive focused real Surge client
  verification.

The intended product label is **Surge — Mature / Supported**, not **Surge —
Complete**. A key remaining unsupported is not, by itself, a release defect.
The release question is whether a normal ProxyFlow user can safely build and
export a useful daily Surge configuration.

## Architecture and ownership contract

The pipeline remains:

```text
Visual Graph
→ Graph Semantic Compiler
→ Universal Proxy IR
→ Semantic Validator
→ Target Capability / Adapter
→ Target Compiler
→ Client Config
```

The following rules are non-negotiable:

1. The Project Graph is the source of truth. IR is a typed, read-only derived
   view, not a second editor state.
2. Universal IR contains portable semantics only. Surge-specific semantics
   use typed, namespaced target-native extensions.
3. There is no raw `[General]` map and no magic-string semantic inference.
   Client-specific semantics do not enter Universal IR without proven
   portability.
4. There is no silent downgrade and no silent stripping. Unsupported retained
   intent blocks the relevant export with a stable diagnostic.
5. Runtime/headless compilation independently validates target-native
   provenance. UI state is not a compiler safety boundary.
6. One emitted Surge `[General]` key has exactly one semantic owner. The
   composer and serializer reject case-insensitive duplicate keys rather than
   relying on last-wins behavior.

In particular, `proxy-test-url` must have one owner: the Universal health-check
lowering (`HealthCheckIR.url`) in `src/targets/surge/health.ts`. An Output
native control must never become a second source of truth for that key.
`internet-test-url` is a different Surge-native semantic and is owned by the
selected Surge Output. The two keys can be emitted together with independent
values.

## Status vocabulary

The roadmap uses these statuses consistently:

| Status | Meaning |
| --- | --- |
| **Implemented** | Repository code, validation, and serializer evidence exists for the stated subset. |
| **Planned for 1.4** | Historical planning label; no open 1.4 implementation Slice remains. |
| **Candidate for 1.4** | Historical audit input; all current Candidates are resolved below. |
| **Deferred** | Explicitly post-1.4 work; it must not block the first mature Surge release. |
| **Research Required** | Surge semantics, cross-target intent, or an admission boundary is not proven yet. |
| **Real-client Verification Required** | Compiler/fixture evidence is insufficient; focused Surge iOS or Mac acceptance is still required. |
| **Rejected / Non-goal** | Deliberately outside the 1.4 product objective. |

### Scope at a glance

| Release lens | Roadmap meaning |
| --- | --- |
| **Supported now** | The implemented baseline below, limited to the exact repository-evidenced subsets. |
| **Implemented for 1.4.0** | G0, G1, G2, G3-A, G3-B, and G3-C are implemented in their documented subsets. |
| **Candidates resolved** | All nine remaining Candidates are explicitly deferred or rejected; none was promoted. |
| **Deferred after 1.4.0** | Security, listeners, HTTP processing, platform controls, and other backlog categories below. |
| **Future admission audits** | Required only if a deferred item is revisited; not a 1.4 release gate. |
| **Real-client Verification Required** | Focused import and behavior checks on actual Surge iOS/Mac clients before release. |
| **Explicitly out of scope** | The non-goals in the final section; they are not release blockers. |

## Current implemented baseline

### Foundation and routing

The current Surge backend follows the target-neutral Graph → Universal IR →
validation → Surge compatibility → model → serializer path. The implemented
routing subset includes Universal `service`, `domain`, `domain-suffix`,
`domain-keyword`, `ip-cidr`, `ip-cidr6`, `port`, `asn`, and `geo-ip` matchers,
with `DIRECT`, `REJECT`, strategy targets, and `FINAL` lowering. Ten first-party
Service Rules lower to Surge `RULE-SET` assets. Exact single-port `SRC-PORT` is
a typed Surge-native matcher; ranges and comparisons remain unsupported.

Routing-correctness work is part of this baseline: route priorities and graph
insertion-order ties are deterministic; Universal and target-native routes are
merged by compiler-owned `routingOrder`; `FINAL` is emitted after ordinary
rules; target-native Final and route options are provenance-checked; and
unsupported matcher, rule-source, policy, and remote-source semantics fail
closed. Surge `no-resolve` is emitted only for its proven matcher subset.

Strategy support is evidence-bounded: Select and Fixed are supported; URL Test
and Fallback are conditional (including their health-check limits); Smart and
Subnet are typed Surge-native groups; Proxy Chain is conditional on direct
downstream policy members and Surge's `underlying-proxy` constraints. Surge
round-robin and consistent-hash Load Balance are unsupported because their
selection semantics are not equivalent to ProxyFlow's Universal intent.

### General G0 — Runtime Safety (Implemented)

The typed `[General]` boundary in `src/targets/surge/model.ts` admits only the
known key/value shapes. Safe URL and serialized-string guards, structured-clone
snapshots, owner checks, duplicate/collision protection, and serializer
validation make malformed or ambiguous runtime data fail closed. Unset values
are omitted, preserving Surge defaults and byte stability.

### General G1 — Network / VIF (Implemented)

The Output-owned typed family emits only explicitly authored values for:

- `ipv6`;
- `ipv6-vif` (`disabled`, `auto`, or `always`); and
- `icmp-forwarding`.

The graph compiler binds the extension to a concrete enabled Surge Output;
multiple effective owners, misplaced records, malformed records, and retained
intent selected for another target are rejected rather than guessed.

### General G2 — Connectivity (Implemented)

The two connectivity keys are intentionally separate:

- `proxy-test-url` is the Universal strategy health-check/default proxy test
  semantic. It lowers to the single global Surge key only for the proven
  shared URL Test/Fallback scope. Conflicting, missing, or otherwise unsafe
  testing surfaces fail closed.
- `internet-test-url` is a concrete Surge-native Output semantic for Internet
  connectivity checks and the DIRECT policy. It is not `HealthCheckIR.url`,
  and it is not a policy health-check override. Its typed value is retained
  when the Output changes target; a non-Surge export fails closed instead of
  mapping it to another target's health-check field.

`test-timeout` and `proxy-test-udp` are not implemented in this baseline.

### Universal DNS General settings (Implemented subset)

`dns-server` and `encrypted-dns-server` originate from Universal DNS intent and
are lowered by the Surge adapter for the proven automatic/System/IPv4 UDP and
pure DoH/DoT subsets. Resolver roles that Surge cannot preserve, mixed
traditional and encrypted transport semantics, malformed addresses, and
traditional IPv6-upstream intent fail closed. The adapter does not infer
Fake-IP, per-domain DNS, or other target-native behavior.

### G3-A — DNS behavior (Implemented)

`always-real-ip` is a Surge-native Host List controlling Fake-IP answers: a
matching domain is sent upstream for a real routable address. Its semantic
owner is the effective enabled DNS graph node, not an Output and not Universal
`DnsIR`. The Project-layer record is typed and the graph compiler adds the
compiler-owned `dnsNodeId`; misplaced, malformed, duplicate, or ambiguous
records fail closed. The supported subset is positive domain patterns with `*`
and `?` wildcards, not arbitrary Host List grammar.

`universalDnsMode = none` plus `always-real-ip` is valid: the DNS owner remains
available for target-native behavior while no Universal `DnsIR` is produced.
This separation must remain intact in 1.4; `always-real-ip` must not be moved
into Universal DNS merely to make a new control convenient.

No focused real-device verification of G1, G2, or G3-A is claimed by this
roadmap. Automated typed-boundary, graph/provenance, compatibility, and
serializer tests are compiler/fixture evidence, not real-client evidence.

## Implemented 1.4.0 scope

The 1.4.0 implementation scope is complete and intentionally finite. The
remaining release path is documentation closure followed by focused Surge
Mac/iOS real-client acceptance. No additional General implementation is
required before v1.4.0.

### G3-B — VIF route control (Implemented subset)

`tun-excluded-routes` and `tun-included-routes` are Surge Output-owned controls
in the `tun-capture / VIF routing behavior` family.

- `tun-excluded-routes` contains IPv4/IPv6 CIDRs that bypass the Surge VIF.
  It applies to VIF traffic, not requests handled by Surge Proxy Server.
- `tun-included-routes` adds more-specific CIDRs intentionally captured by the
  VIF when a smaller Wi-Fi route would otherwise win. It is **not** a generic
  inverse allowlist of `tun-excluded-routes`; route specificity and operating
  system interface selection are the semantics.
- The official documentation advises combining appropriate VIF bypass behavior
  with `skip-proxy` when full bypass semantics are required. The 1.4 design
  must preserve that distinction and must not lower either key into a
  Universal routing or DNS exclusion.

The existing Output-owned `general-network` family is the sole owner. The
shared CIDR parser canonicalizes host bits only while authoring; persisted and
runtime values must already be canonical and unique. IPv6 routes require
`ipv6-vif=auto` or `always`, proper more-specific overlap is allowed, and an
exact same-prefix cross-list conflict is rejected. Non-Surge targets retain
intent but fail closed rather than translating it. Broad RFC1918 included
ranges receive a warning. `skip-proxy` remains a separate G3-C family and is
never created or modified by G3-B. No focused
real-device verification is claimed.

### G3-C — System proxy bypass (Implemented subset)

`skip-proxy` and `exclude-simple-hostnames` are Surge Output-owned controls in
the `proxy-bypass / system-proxy compatibility` family. The independent typed
`targetNativeSurgeGeneralProxyBypass` family emits only explicitly authored
values and is retained (read-only) when an Output changes to another target;
that target fails closed rather than silently stripping the intent.

- `skip-proxy` controls whether matching traffic is handled by Surge VIF
  instead of Surge proxy (and, on macOS, the system-proxy settings). It is a
  compatibility bypass, **not a policy routing rule**.
- `exclude-simple-hostnames` applies the same VIF-over-proxy compatibility
  behavior to hostnames without a dot. It is **not DNS exclusion**.

These keys are not represented as Universal route matchers or DNS filters.
`skip-proxy` preserves authored order and admits exact dotted ASCII domains,
specific literal simple hostnames (for example `localhost`), one leading
wildcard domain form, exact IPv4, `a.b.c.*` trailing-octet IPv4 wildcards, and
IPv4 CIDR (host bits are normalized only while authoring). Negative entries,
`?`, ports, special angle tokens, IPv6, arbitrary interior wildcards, numeric
ranges, and broad catch-alls remain deferred. `<simple-hostname>` is not
admitted because the Boolean owns the broad all-simple-hostnames intent;
`skipProxy: ['localhost']` remains valid and distinct. No real-client
verification is claimed.

## Resolved Candidates after the 1.4.0 Closure Audit

The Closure Audit resolved every remaining Candidate. No Candidate was
promoted into 1.4.0. Deferred items may receive a new admission audit only if a
future product slice explicitly revisits them.

### Connectivity candidates

- `test-timeout` — **Deferred after 1.4.** Surge's default proxy
  connectivity-test timeout is 5 seconds; DIRECT uses a separate documented
  10-second timeout. Omission is usable for normal workflows, and adding the
  control requires careful separation from Universal health semantics.
- `proxy-test-udp` — **Deferred after 1.4.** This is an optional
  `hostname@IPv4` UDP probe sent to port 53. It is not required for normal URL
  Test/Fallback correctness, and ProxyFlow has no proven Universal UDP-health
  contract. Safe omission is supported; Surge does not document a concrete
  default endpoint.

### DNS candidates

- `hijack-dns` — **Deferred after 1.4.** This intercepts explicitly targeted
  standard DNS traffic and is distinct from resolver selection, Fake-IP, and
  `always-real-ip`. It has high side-effect and client-verification cost.
- `allow-dns-svcb` — **Deferred after 1.4.** The documented default is
  `false`, preserving Fake-IP A-record behavior; enabling it is not required
  for the supported daily DNS subset.
- `encrypted-dns-follow-outbound-mode` — **Deferred after 1.4.** The
  documented default is `false` (DIRECT). Following outbound rules introduces
  resolver-routing, bootstrap, and leak/loop semantics outside Universal
  `DnsIR`.
- `use-local-host-item-for-proxy` — **Rejected / outside current product
  boundary.** It depends on Surge Local DNS Mapping / `[Host]` semantics, which
  ProxyFlow does not model as a Project source of truth. This rejection is from
  the current 1.4 boundary, not a permanent impossibility if that model is
  added later.

### Traffic-behavior candidates

- `udp-policy-not-supported-behaviour` — **Deferred after 1.4.** Official
  default is `REJECT`, which is fail-closed and prevents an unexpected DIRECT
  fallback for unsupported UDP relay.
- `block-quic` — **Deferred after 1.4.** The global default is `per-policy`;
  ProxyFlow does not model the complete related per-policy ownership surface,
  so a global-only override would create precedence ambiguity.
- `loglevel` — **Deferred after 1.4.** This is an operational preference with
  default `notify`; it does not affect configuration correctness.

No raw `[General]` field, second source of truth, or new target mapping is
introduced by these decisions.

## Deferred after 1.4.0

The following categories are useful but must not block the first mature Surge
release.

### Security-sensitive and remote access (Deferred)

`proxy-restricted-to-lan`, `gateway-restricted-to-lan`,
`external-controller-access`, `http-api`, `http-api-tls`, and
`http-api-web-dashboard` expose listeners, credentials, remote control, or
certificate/security boundaries. They require a separate security review and
platform acceptance.

### LAN proxy services (Deferred)

`allow-wifi-access`, `allow-hotspot-access`, `wifi-access-http-port`,
`wifi-access-socks5-port`, and `wifi-access-http-auth` are listener,
authentication, and platform-specific semantics. They are not generic Output
strings.

### HTTP processing (Deferred)

`force-http-engine-hosts`, `always-raw-tcp-hosts`, and
`always-raw-tcp-keywords` belong to a later HTTP-processing workstream. They
must not be added as generic `[General]` strings in this milestone.

### MITM / Rewrite / Script (Deferred / separate workstream)

MITM, Rewrite, and Script require separate security, certificate, execution,
and client-verification boundaries. They remain outside the 1.4 release gate.

### Advanced iOS network behavior (Deferred)

`compatibility-mode`, `wifi-assist`, `all-hybrid`, `hide-vpn-icon`,
`include-all-networks`, `include-local-networks`, `include-apns`, and
`include-cellular-services` have platform-specific behavior and high side-effect
risk. They require real Surge iOS verification and are not first-release
General blockers.

### Mac listeners (Deferred)

`http-listen` and `socks5-listen` are listener/security/platform behavior and
remain outside the first mature release.

### Debug and low-priority General (Deferred)

Examples include `debug-cpu-usage`, `debug-memory-usage`, `show-error-page`,
`show-error-page-for-reject`, `geoip-maxmind-url`, `disable-geoip-db-auto-update`,
and `udp-priority`. They remain deferred unless repository evidence later
establishes an existing supported semantic.

## Protocol backlog is separate

Protocol breadth is not part of the Surge General release gate. Snell, Naïve,
VLESS expansion, Hysteria2 expansion, TUIC expansion, AnyTLS expansion, and
other client-specific protocol options are **Deferred / separate workstream**.
The General milestone must not be held hostage to protocol breadth; unsupported
protocol intent continues to fail closed.

## Real-client Verification Required

The following policy defines what must be verified before release.

Compiler and test coverage must be reported at the correct evidence level:

| Evidence level | What it proves | Current 1.4 roadmap status |
| --- | --- | --- |
| Compiler tested | Typed graph/IR/compatibility/lowering behavior in repository tests. | Present for the implemented baseline. |
| Fixture tested | Deterministic profile shape and serialization against checked-in fixtures. | Present where fixtures exist. |
| Runtime/headless tested | Non-UI compilation and runtime-boundary validation. | Present for target-native boundaries. |
| Real Surge iOS verified | Import and focused behavior on an actual Surge iOS client, with version recorded. | **Real-client Verification Required; not claimed here.** |
| Real Surge Mac verified | Import and focused behavior on an actual Surge Mac client, with version recorded. | **Real-client Verification Required; not claimed here.** |

Historical acceptance material in the repository does not substitute for a
focused 1.4 pass over the important generated General and routing paths. Before
1.4.0, run a focused real-client acceptance pass on both relevant platforms (or
record a documented platform limitation) covering G0/G1/G2/G3-A, G3-B/G3-C,
DNS, routing precedence, `FINAL`, and representative proxy traffic. Record
client version, import result, parser diagnostics, and behavior. Do not record
real endpoints, credentials, subscriptions, or certificates.

## Mandatory Surge 1.4.0 Closure Audit

Completed against audit baseline `5b811ce8b57cc8d8e634fa39c550bb61474d99fa`.

```text
Decision: SURGE 1.4 FEATURE SCOPE CLOSED
Promoted Candidates: None
New untracked release-critical General omissions: None
```

Final decisions:

| Candidate | Closure decision |
| --- | --- |
| `test-timeout` | Deferred after 1.4 |
| `proxy-test-udp` | Deferred after 1.4 |
| `hijack-dns` | Deferred after 1.4 |
| `allow-dns-svcb` | Deferred after 1.4 |
| `encrypted-dns-follow-outbound-mode` | Deferred after 1.4 |
| `use-local-host-item-for-proxy` | Rejected / outside current product boundary |
| `udp-policy-not-supported-behaviour` | Deferred after 1.4 |
| `block-quic` | Deferred after 1.4 |
| `loglevel` | Deferred after 1.4 |

The audit verified one owner per emitted General key, fail-closed retained
cross-target intent, and byte-stable omission of unset values. A remaining
unsupported Surge key is not a reason to extend the scope indefinitely.

## Release gate

- [x] Core Surge proxy, policy, and routing workflow is stable at the documented supported subset.
- [x] DNS export is stable for the documented supported subset.
- [x] General G0/G1/G2 is stable at the compiler/runtime evidence level.
- [x] G3-A `always-real-ip` is stable and remains DNS-node-owned at the compiler/runtime evidence level.
- [x] G3-B is resolved with explicit VIF-route ownership and semantics.
- [x] G3-C is resolved with explicit system-proxy compatibility ownership for
  the admitted v1.4 subset; deferred Host List grammar remains documented.
- [x] Surge 1.4.0 Closure Audit is complete.
- [x] Candidate General items are explicitly promoted, deferred, or rejected.
- [x] No known silent-downgrade or silent-stripping path remains.
- [x] Cross-target retained intent fails closed.
- [ ] Important generated Surge profiles receive real-client verification.
- [x] Capability and documentation matrices are reconciled by this Slice.
- [ ] Full CI and acceptance checks are green.

“Every Surge option implemented” is intentionally not a release gate.

### Remaining blockers after closure

1. Focused Surge Mac acceptance of the implemented high-impact paths.
2. Focused Surge iOS acceptance of the implemented high-impact paths.
3. Any concrete compiler or client defects demonstrated by those acceptance
   passes.
4. Final release-engineering, version, and release-note closure.

There is currently no promoted General Candidate, no known compiler/runtime
blocker, and no known silent-strip blocker.

## Authoritative backlog

The table below is the scope record. Candidate rows reflect the completed
Closure Audit; any future admission work is post-1.4 and does not block this
release scope.

| Feature | Surge section | Status | Priority | Semantic owner | Universal / Surge-native | Expected output | Why deferred / prerequisite | Risk | Official reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ipv6` | General / Network | Implemented | High | Surge Output (implemented) | Surge-native | `[General] ipv6` | — | Medium: changes VIF/IPv6 behavior | [General](https://manual.nssurge.com/profile/general.html#ipv6) |
| `ipv6-vif` | General / Network | Implemented | High | Surge Output (implemented) | Surge-native | `[General] ipv6-vif` | — | High: `always` can break IPv4-only networks | [General](https://manual.nssurge.com/profile/general.html#ipv6-vif) |
| `icmp-forwarding` | General / Network | Implemented | Medium | Surge Output (implemented) | Surge-native | `[General] icmp-forwarding` | — | Medium: direct ICMP can leak addresses | [General](https://manual.nssurge.com/profile/general.html#icmp-forwarding) |
| `proxy-test-url` | General / Connectivity | Implemented | High | Universal health-check lowering (implemented; sole owner) | Universal semantic lowered to Surge | `[General] proxy-test-url` when strict shared scope is proven | Keep one owner; no Output duplicate | High if URLs or testing surfaces are collapsed | [General](https://manual.nssurge.com/profile/general.html#proxy-test-url) |
| `internet-test-url` | General / Connectivity | Implemented | High | Surge Output (implemented) | Surge-native | `[General] internet-test-url` | — | Medium: affects Internet/DIRECT checks | [General](https://manual.nssurge.com/profile/general.html#internet-test-url) |
| `dns-server` | General / DNS | Implemented subset | High | Universal DNS adapter (implemented) | Universal semantic lowered to Surge | `[General] dns-server` list | Roles, mixed transport, and unsupported IPv6 upstreams fail closed | High: resolver semantics | [General](https://manual.nssurge.com/profile/general.html#dns-server) |
| `encrypted-dns-server` | General / DNS | Implemented subset | High | Universal DNS adapter (implemented) | Universal semantic lowered to Surge | `[General] encrypted-dns-server` list | Pure DoH/DoT only; no mixed traditional family | High: bootstrap and transport differences | [General](https://manual.nssurge.com/profile/general.html#encrypted-dns-server) |
| `always-real-ip` | General / DNS behavior | Implemented | High | Effective DNS node (implemented) | Surge-native | `[General] always-real-ip` Host List | Must remain outside `DnsIR`; `none` coexistence required | High: Fake-IP answer behavior | [General](https://manual.nssurge.com/profile/general.html#always-real-ip) |
| `tun-excluded-routes` | General / VIF route control | Implemented subset | High | Surge Output (existing general-network family) | Surge-native | `[General] tun-excluded-routes` canonical CIDR list | Real-client verification remains open; skip-proxy is separate G3-C | High: traffic bypass/leakage | [General](https://manual.nssurge.com/profile/general.html#tun-excluded-routes) |
| `tun-included-routes` | General / VIF route control | Implemented subset | High | Surge Output (existing general-network family) | Surge-native | `[General] tun-included-routes` canonical CIDR list | Specificity overlap preserved; real-client verification remains open | High: capture/loop risk | [General](https://manual.nssurge.com/profile/general.html#tun-included-routes) |
| `skip-proxy` | General / System Proxy Bypass | Implemented subset | High | Surge Output (`general-proxy-bypass`) | Surge-native | `[General] skip-proxy` typed Host List | Positive v1.4 subset only; negatives, ports, special tokens, IPv6, and broad wildcard grammar deferred; no real-client verification claimed | High: proxy/VIF leakage | [General](https://manual.nssurge.com/profile/general.html#skip-proxy) |
| `exclude-simple-hostnames` | General / System Proxy Bypass | Implemented | Medium | Surge Output (`general-proxy-bypass`) | Surge-native | `[General] exclude-simple-hostnames` | Tri-state omission/true/explicit false; remains separate from specific `localhost` list entries; no real-client verification claimed | Medium: local-name handling | [General](https://manual.nssurge.com/profile/general.html#exclude-simple-hostnames) |
| `test-timeout` | General / Connectivity | Deferred after 1.4 | Medium | Future Surge Output owner if revisited | Surge-native future option | `[General] test-timeout` seconds | 5-second proxy default and separate 10-second DIRECT timeout are usable; preserve Universal health ownership | Medium: timeout/user latency | [General](https://manual.nssurge.com/profile/general.html#test-timeout) |
| `proxy-test-udp` | General / Connectivity | Deferred after 1.4 | Medium | Future Surge Output owner if revisited | Surge-native future option | `[General] proxy-test-udp` hostname@IPv4 | Optional UDP probe; no concrete documented endpoint default and no Universal UDP-health contract | Medium: UDP reachability | [General](https://manual.nssurge.com/profile/general.html#proxy-test-udp) |
| `hijack-dns` | General / DNS | Deferred after 1.4 | Medium | Future Surge DNS interception owner if revisited | Surge-native future option | `[General] hijack-dns` | High-side-effect DNS interception is not required by the supported DNS subset | High: DNS interception | [General](https://manual.nssurge.com/profile/general.html#hijack-dns) |
| `allow-dns-svcb` | General / DNS | Deferred after 1.4 | Low | Future Surge DNS owner if revisited | Surge-native future option | `[General] allow-dns-svcb` | Default `false` preserves Fake-IP behavior; no release-critical daily value | Medium: address selection | [General](https://manual.nssurge.com/profile/general.html#allow-dns-svcb) |
| `encrypted-dns-follow-outbound-mode` | General / DNS | Deferred after 1.4 | Medium | Future DNS/Output owner if revisited | Surge-native future option | `[General] encrypted-dns-follow-outbound-mode` | Default DIRECT path is safe; outbound coupling is outside Universal `DnsIR` | High: resolver routing/leaks | [General](https://manual.nssurge.com/profile/general.html#encrypted-dns-follow-outbound-mode) |
| `use-local-host-item-for-proxy` | General / DNS | Rejected / outside current product boundary | Low | No current ProxyFlow owner | Not admitted | Not emitted | Requires an explicit Local Host Mapping Project source before a toggle could be meaningful | Medium: endpoint resolution | [General](https://manual.nssurge.com/profile/general.html#use-local-host-item-for-proxy) |
| `udp-policy-not-supported-behaviour` | General / Traffic | Deferred after 1.4 | Medium | Future Surge Output owner if revisited | Surge-native future option | `[General] udp-policy-not-supported-behaviour` | Official default `REJECT` is fail-closed; exposing a global fallback is unnecessary for 1.4 | High: accidental DIRECT leak | [General](https://manual.nssurge.com/profile/general.html#udp-policy-not-supported-behaviour) |
| `block-quic` | General / Traffic | Deferred after 1.4 | Medium | Future Surge Output owner if revisited | Surge-native future option | `[General] block-quic` | Default `per-policy` is safe; ProxyFlow does not model the complete per-policy ownership surface | High: protocol reachability | [General](https://manual.nssurge.com/profile/general.html#block-quic) |
| `loglevel` | General / Logging | Deferred after 1.4 | Low | Future Surge Output owner if revisited | Surge-native future option | `[General] loglevel` | Operational preference only; default `notify` is sufficient | Low/Medium: diagnostics volume | [General](https://manual.nssurge.com/profile/general.html#loglevel) |
| `proxy-restricted-to-lan`, `gateway-restricted-to-lan` | General / Remote access | Deferred | Low | Surge Output; security review required | Surge-native | `[General]` listener restrictions | Security boundary and platform acceptance | High: exposure | [General](https://manual.nssurge.com/profile/general.html#proxy-restricted-to-lan) |
| `external-controller-access`, `http-api`, `http-api-tls`, `http-api-web-dashboard` | General / Remote access | Deferred | Low | Surge Output; security review required | Surge-native | `[General]` controller/API settings | Secrets, certificates, remote control | Critical: remote takeover | [General](https://manual.nssurge.com/profile/general.html#external-controller-access) |
| `allow-wifi-access`, `allow-hotspot-access`, `wifi-access-http-port`, `wifi-access-socks5-port`, `wifi-access-http-auth` | General / LAN services | Deferred | Low | Surge Output; platform/security review required | Surge-native | `[General]` LAN listener settings | Listener and authentication semantics | High: LAN exposure | [General](https://manual.nssurge.com/profile/general.html#allow-wifi-access) |
| `force-http-engine-hosts`, `always-raw-tcp-hosts`, `always-raw-tcp-keywords` | General / HTTP processing | Deferred | Low | Separate HTTP-processing owner | Surge-native | `[General]` Host List/keyword settings | Separate workstream; not generic strings | High: interception behavior | [General](https://manual.nssurge.com/profile/general.html#force-http-engine-hosts) |
| MITM / Rewrite / Script | HTTP processing | Deferred | Non-blocking | Separate future workstream | Surge-native | Separate sections and assets | Certificate, execution, and security design required | Critical: code execution/privacy | [General](https://manual.nssurge.com/profile/general.html#traffic-processing) |
| `compatibility-mode`, `wifi-assist`, `all-hybrid`, `hide-vpn-icon` | iOS-only General | Deferred | Low | Surge iOS Output; platform review required | Surge-native | `[General]` iOS controls | Side effects and device verification | High: connectivity/system behavior | [General](https://manual.nssurge.com/profile/general.html#working-mode) |
| `include-all-networks`, `include-local-networks`, `include-apns`, `include-cellular-services` | iOS-only General | Deferred | Low | Surge iOS Output; platform review required | Surge-native | `[General]` tunnel-scope controls | Required combinations and OS side effects | High: leaks/AirDrop/Xcode impact | [General](https://manual.nssurge.com/profile/general.html#vpn-tunnel-scope) |
| `http-listen`, `socks5-listen` | Mac-only General | Deferred | Low | Surge Mac Output; listener review required | Surge-native | `[General]` listener settings | Security and platform behavior | High: local/network exposure | [General](https://manual.nssurge.com/profile/general.html#surge-mac-only-parameters) |
| Debug/low-priority keys (`debug-cpu-usage`, `debug-memory-usage`, `show-error-page`, `show-error-page-for-reject`, `geoip-maxmind-url`, `disable-geoip-db-auto-update`, `udp-priority`) | General / Debug | Deferred | Low | Future admission only; no current implementation claim | Surge-native | `[General]` key when separately admitted | Not release-critical; repository evidence required | Low/Medium | [General](https://manual.nssurge.com/profile/general.html#traffic-processing) |
| Snell, Naïve, VLESS expansion, Hysteria2/TUIC/AnyTLS expansion | Proxy protocols | Deferred / separate workstream | Non-blocking | Protocol-specific adapters | Surge-native | Protocol sections/policies | Keep protocol breadth outside General gate | High: semantic drift | [Surge policies](https://manual.nssurge.com/policies/overview.html) |

## Explicit Non-Goals for v1.4.0

Surge 1.4.0 does not require:

- 100% Surge General coverage;
- MITM;
- Rewrite;
- Script;
- HTTP API/controller;
- LAN listener management;
- complete iOS/Mac platform-specific controls;
- complete Host List grammar;
- every Surge-native DNS option; or
- every Surge-native protocol.

These are deliberate scope boundaries, not missing acceptance criteria. Any
future expansion must pass the feature-admission gate, establish one semantic
owner, preserve fail-closed cross-target behavior, and include an explicit
client-verification plan.

## Official semantic reference

The current official reference used for General-key semantics is [Surge
General Section Options](https://manual.nssurge.com/profile/general.html),
including its Connectivity Testing, VIF, System Proxy Bypass, DNS, Traffic
Processing, iOS-only, Mac-only, and Remote Access sections. The repository's
implementation and capability evidence remain authoritative for what
ProxyFlow actually supports.

Related repository evidence:

- [`docs/surge-compiler.md`](surge-compiler.md) — current capability matrix,
  ownership boundaries, DNS lowering, health checks, and protocol limits.
- [`docs/architecture.md`](architecture.md) — Project/Graph/IR ownership and
  compiler pipeline.
- [`src/targets/surge/capabilities.ts`](../src/targets/surge/capabilities.ts)
  — executable Surge capability decisions.
- [`src/core/targetNative/`](../src/core/targetNative/) and
  [`src/core/graphCompiler/`](../src/core/graphCompiler/) — typed target-native
  boundaries and compiler provenance.

## Next gate

**Next: Surge 1.4 Real-client Acceptance**

The focused Mac/iOS acceptance pass must cover the implemented G0/G1/G2/G3-A,
G3-B, and G3-C paths, DNS, routing precedence, `FINAL`, representative
strategies, Proxy Chain, Service Rules, and representative proxy traffic.
This documentation Slice does not claim that those checks have been performed.

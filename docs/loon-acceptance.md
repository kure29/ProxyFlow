REAL LOON IMPORT: PASSED
REAL PROXY TRAFFIC: PASSED
LOON SERVICE RULES: PENDING USER ACCEPTANCE

# Loon Real Client Readiness

This document records the developer-only acceptance boundary for the Loon
compiler. It is not a product launch or a supported-target declaration. It
records one successful real-client acceptance of the audited materialized
subset without enabling Loon on formal product surfaces.

## Baseline

- Repository: `kure29/ProxyFlow`
- Foundation baseline: merged PR #41, commit `0a16491`
- Readiness branch: `feat/loon-client-readiness`
- Tested Loon version: **3.5.0 (975)**
- Tested iOS version: **NOT RECORDED**
- Import result: **PASSED**
- Real proxy traffic: **PASSED**
- Core Loon profile acceptance: **PASSED**
- First-party Service Rules Foundation: **IMPLEMENTED**
- First-party Service Rules real-client acceptance: **PENDING**

The compiler continues to consume Universal IR through the existing graph and
projection pipeline. Loon remains absent from Target selector, New Project,
Export, Preview, compiler registry, and formal product UI surfaces. There is no
version bump, release, tag, merge, or container publish in this phase.

## Evidence Baseline

The historical Foundation evidence is pinned to LoonManual commit
[`4311d0030fe3065d4664b403a32010f083b99273`](https://github.com/Loon0x00/LoonManual/commit/4311d0030fe3065d4664b403a32010f083b99273).
The current first-party node page was retrieved on **2026-08-24**:
[`https://nsloon.app/docs/Node/`](https://nsloon.app/docs/Node/). It explicitly
proves Loon protocol/syntax capability for Shadowsocks stream/AEAD/2022,
Simple Obfs, SOCKS5, VLESS TCP/WS/HTTP, XTLS Vision + Reality, Hysteria2, and
AnyTLS Build 945+, including an SS2022 example with a quoted credential
containing `=`.

This is capability evidence for Loon itself, not proof that ProxyFlow's
Universal IR preserves every field or that this adapter can lower it without
loss. The current page therefore supersedes stale "Loon does not support" or
"unproven in Loon" wording, while the adapter may still keep a feature
`deferred` pending an IR audit and real-client acceptance. The audited
materialized subset has now passed one real-client import and traffic check;
Reality, SOCKS5, and AnyTLS remain intentionally deferred.

The first-party Service Rules evidence is a separate three-source chain:

- [`kure29/proxyflow-rules` commit `27d38e44282115e071d19c846c17e14e6d2e584b`](https://github.com/kure29/proxyflow-rules/commit/27d38e44282115e071d19c846c17e14e6d2e584b)
  proves ProxyFlow's canonical service JSON, deterministic generator, validator,
  and owned `rules/loon/*.list` assets.
- [Current Loon Remote Rule documentation source at `65292c2089fb3fd8b43a8dfbeeaa5f286d7cc737`](https://github.com/Loon0x00/Loon0x00.github.io/blob/65292c2089fb3fd8b43a8dfbeeaa5f286d7cc737/docs/Rule/sub_rule.md#L5-L10)
  proves that a subscription is a remote rule collection whose lines use
  Loon-supported rule syntax.
- [LoonExampleConfig `example.conf` at `dfbfc0b74dd689d9d76d5b6da7fe3778791c0710`](https://github.com/Loon0x00/LoonExampleConfig/blob/dfbfc0b74dd689d9d76d5b6da7fe3778791c0710/example.conf#L101-L105)
  proves `[Remote Rule]` and the exact
  `URL,policy=PROXY,enabled=true` entry form.

The first source owns ProxyFlow's asset URLs and content; only the Loon sources
are authority for target syntax. None of them substitutes for the pending real
client import, download, refresh, traffic, or failure-behavior observations.

## Checked-in Fixtures

The deterministic main fixture is
[`fixtures/loon/acceptance-project.json`](../fixtures/loon/acceptance-project.json).
It contains a sanitized paste-style subscription document using only
`example.com`, `example.net`, `.invalid`, documentation IP ranges, fictional
UUIDs, and fictional credentials. No URL is fetched and no subscription secret
is required.

The generated profile is
[`fixtures/loon/acceptance.expected.conf`](../fixtures/loon/acceptance.expected.conf).
Focused pure-family fixtures and goldens are checked in beside it:

- `fixtures/loon/routing-ip-project.json` and `routing-ip.expected.conf`
- `fixtures/loon/dns-doh-project.json` and `dns-doh.expected.conf`

The main profile covers HTTP, HTTP credentials, HTTPS, Shadowsocks
`aes-128-gcm`, Shadowsocks `chacha20`, canonical `simple-obfs`, Trojan TCP,
VMess TCP with explicit `alterId`, VMess WS, VLESS TCP, VLESS WS, and minimal
Hysteria2. It also covers Select, nested Select, URL Test, Fallback,
Round-Robin, Fixed, a pure domain-family route set, FINAL, and system DNS.

[`fixtures/loon/simple-obfs-source.yaml`](../fixtures/loon/simple-obfs-source.yaml)
keeps the real SIP003 source shape (`obfs` and `obfs-host`) separate from the
Loon target golden. The target lowering emits `obfs-name` and never invents an
`obfs-uri` when the source has none.

The focused IP profile covers `IP-CIDR`, `IP-CIDR6`, `GEOIP`, and FINAL. The
focused DNS profile covers a pure `doh-server` set. No mixed domain/IP profile
is generated.

## Generate

`npm run loon:acceptance` reads only the checked-in sanitized fixtures. It
passes the content through the existing subscription parser, Graph compiler,
Universal IR, Loon compatibility evaluator, and deterministic serializer. The
command has no network access, reads no `.env` or home-directory config, emits
LF with exactly one trailing newline, and uses a fixed timestamp. It writes only
the checked-in golden files and reports safe counts:

```text
candidateCount
compatibleEndpointCount
skippedEndpointCount
blockingIssueCount
```

## Local Subscription Check

Real-client preparation can be exercised locally without adding the input to
Git. Put a sanitized or private subscription document at
`tmp/loon-real-subscription.txt` and run:

```bash
npm run loon:acceptance:local
```

The command also accepts `LOON_LOCAL_SUBSCRIPTION_FILE=tmp/other.txt`. The
path must remain under this repository's `tmp/` directory; `.env` and `.git`
paths are rejected. The parser and compiler are reused, but stdout contains
only aggregate counts and diagnostic code counts. Endpoint names, URLs,
passwords, UUIDs, and serialized content are never printed. A successful
developer-only profile is written to the ignored
`tmp/loon-real-subscription.conf`; a blocked compilation returns a non-zero
status and preserves the diagnostic boundary.

The local workflow checks the following semantics without changing capability:

- an unused incompatible endpoint does not block an otherwise valid profile;
- a partially compatible active pool keeps compatible members and emits an
  aggregated skip warning;
- an all-incompatible active pool is a blocker;
- an incompatible Fixed endpoint is a blocker;
- the report remains aggregate-only and does not disclose endpoint content.

Observed failures are acceptance findings. They must be recorded as
`BLOCKED -> fix -> RETEST -> PASSED`; a failed real-client import must not be
used as a reason to widen the Foundation allowlist.

## Real Subscription Attempt 1

Status: **BLOCKED BEFORE CLIENT IMPORT**

Only aggregate diagnostics from the first private acceptance attempt are
retained:

- candidates: `95`
- compatible: `0`
- skipped: `95`
- protocols: Shadowsocks `93`, VLESS `2`
- aggregate diagnostics: `LOON_PROXY_CIPHER_UNSUPPORTED`,
  `LOON_PROXY_VARIANT_UNSUPPORTED`, `LOON_SERIALIZER_UNSAFE_VALUE`,
  `LOON_VLESS_VARIANT_UNSUPPORTED`, `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`,
  `LOON_STRATEGY_NO_COMPATIBLE_MEMBERS`

Primary findings:

- the Unicode policy-name boundary was more conservative than the current
  first-party syntax evidence, but no Unicode round-trip guarantee exists yet;
- SIP003 `simple-obfs` source semantics (`obfs=http|tls`, `obfs-host`) were not
  lowered to Loon's `obfs-name`/`obfs-host` syntax;
- the historical Loon evidence baseline omitted the now-documented SS2022
  syntax;
- Reality endpoints remain intentionally deferred pending a Universal IR and
  exact-lowering audit.

This failed attempt remains recorded as `BLOCKED`; it is not reclassified after
the later fix:

`BLOCKED (Attempt 1) -> FIX (source lowering/evidence update) -> RETEST (91/95, zero blockers) -> REAL IMPORT PASSED -> REAL TRAFFIC PASSED`

No node names, addresses, subscription URL, passwords, UUIDs, hosts, or tokens
are recorded here.

## Compatibility Fix #1

The first retest used the following evidence-backed changes without widening
unproven target capability:

- Syntax-safe UTF-8 policy and node identifiers are preserved. This covers the
  CJK and flag/emoji candidates used in the real retest; those candidates
  survived client import, but this is not a guarantee for every Unicode code
  point. Delimiters, comments, controls, line separators, and outer whitespace
  remain blocked.
- SIP003 `simple-obfs` source options `obfs=http|tls` and `obfs-host` lower to
  Loon `obfs-name=http|tls` and `obfs-host`. No synthetic `obfs-uri` is added;
  conflicting `obfs` and `obfs-name` values fail closed.
- The directly evidenced Shadowsocks method
  `2022-blake3-aes-128-gcm` was added. `2022-blake3-aes-256-gcm` remains
  outside the audited boundary and continues to report
  `LOON_PROXY_CIPHER_UNSUPPORTED`.
- Fixed quoted credentials admit only the directly evidenced safe subset.
  There is no generic CSV, JSON, or backslash escaping grammar.

## Real Subscription Retest

Status: **COMPILED FOR REAL CLIENT**

The user-run local retest produced aggregate-only results:

- candidates: `95`
- compatible: `91`
- skipped: `4`
- blockers: `0`
- diagnostic: `LOON_PROXY_SET_ENDPOINTS_SKIPPED` (`4`)
- result: `COMPILED_LOCAL_ONLY`

The four skipped endpoints are expected compatibility projection outcomes, not
an acceptance failure: two use the still-blocked SS2022 AES-256 method and two
carry VLESS Reality intent whose exact Universal-to-Loon lowering remains
deferred. No endpoint data or private generated profile content is recorded.

## Real Client Acceptance

- Loon version: `3.5.0 (975)`
- iOS version: **NOT RECORDED**
- configuration import: **PASSED**
- compatible proxy inventory (91 endpoints visible): **PASSED**
- Round-Robin represented by the client as the expected load-balance policy:
  **PASSED**
- real proxy traffic: **PASSED**

This records the core materialized-profile acceptance only. It does not claim
separate validation of every URL Test, Fixed, DNS, route, failure-mode, or
long-duration balancing behavior.

## Import Checklist

The checklist remains a template for future detailed client evidence. The
explicitly confirmed observations for this closeout are recorded in
**Real Client Acceptance** above; unconfirmed individual URL Test, Fixed, DNS,
and route checks remain neutral.

1. The `.conf` imports into Loon.
2. Loon reports no parser error.
3. Proxy definitions appear.
4. Proxy groups appear.
5. Select works.
6. URL Test loads.
7. Fixed resolves.
8. Round-Robin loads.
9. DOMAIN rules load.
10. FINAL exists.
11. DNS is accepted.
12. At least one real compatible proxy establishes traffic.
13. Unsupported nodes are skipped or blocked according to diagnostics.
14. No policy reference is dangling.

Result: **CORE ACCEPTANCE PASSED**. Product exposure remains disabled.

## Loon Service Rules Acceptance

Status: **PENDING USER ACCEPTANCE**

This is an independent acceptance axis. It does not change or revoke the core
profile result above. The developer-hidden Foundation now resolves Universal
service matchers only through ProxyFlow's owned Loon asset catalog, lowers them
to typed `LoonRemoteRule` entries, and serializes the directly evidenced form:

```ini
[Remote Rule]
https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/OpenAI.list,policy=Proxy,enabled=true
```

The owned target directory contains exactly `OpenAI.list`, `Claude.list`,
`Google.list`, `Gemini.list`, `YouTube.list`, `Netflix.list`, `Disney.list`,
`Telegram.list`, `GitHub.list`, and `Steam.list`. They are deterministically
generated from the same ten canonical service JSON documents as the other rule
targets. China is intentionally absent and continues to use the existing
GEOIP/GEOSITE path outside this catalog.

The checked-in developer workflow uses the sanitized OpenAI-only
`fixtures/loon/service-rules-project.json` project and exact
`fixtures/loon/service-rules.expected.conf` golden without fetching the remote
asset:

```bash
npm run loon:service-rules:acceptance
```

The optional private workflow reuses the existing local subscription input,
selects a compatible endpoint, and writes only the ignored developer artifact:

```bash
npm run loon:service-rules:acceptance:local
```

Its input remains `tmp/loon-real-subscription.txt`; successful output is
`tmp/loon-service-rules-acceptance.conf`. It must report aggregate counts,
diagnostic code counts, Remote Rule count, and public canonical service IDs
only. It must never print subscription data, endpoint fields, credentials, or
the generated configuration body, and it never imports into Loon automatically.

On Loon `3.5.0 (975)`, every item below remains pending until the user records a
real-client observation:

1. The configuration imports.
2. Loon reports no parser error.
3. The `[Remote Rule]` resource appears.
4. The OpenAI rule subscription downloads successfully.
5. Its policy binding resolves to the compiled Loon policy group.
6. OpenAI traffic uses the intended policy.
7. Other traffic follows `FINAL`.
8. Refreshing rule subscriptions succeeds.
9. No policy reference is dangling.
10. The first-party asset remains external and updateable.

Not proven by this Foundation or checklist:

- precedence between local `[Rule]` entries and `[Remote Rule]` resources;
- ordering between multiple Remote Rule subscriptions with different policies;
- overlapping Google and Gemini service ordering;
- arbitrary interleaving according to Universal priority;
- HTTP request details, cache/persistence, refresh cadence, and download,
  refresh, or parse failure behavior.

The compiler therefore blocks local matcher plus service combinations and
different-policy service-route combinations with
`LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`. Reusing one service asset with two
policies blocks with `LOON_SERVICE_RULE_POLICY_CONFLICT`. Exact duplicate
URL-plus-policy references are deduplicated, same-policy service assets may be
emitted deterministically, and `FINAL` is not a conflicting local matcher.
Custom `rule-set` routes and arbitrary remote lists remain blocked by
`LOON_RULE_SOURCE_FORMAT_UNPROVEN`.

## Preserved Foundation Boundaries

The readiness workflow does not relax any Foundation decision:

- mixed domain/IP route precedence remains blocked by
  `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` until a deliberate mixed-family
  precedence fixture proves equivalence to Universal priority;
- syntax-safe Unicode policy names are preserved for acceptance candidates;
  the tested CJK and flag/emoji candidates survived import, while broader
  Unicode round-trip remains conditional;
- serializer delimiter, quote, backslash, control-character, and non-policy
  Unicode values remain conservative and can fail with
  `LOON_SERIALIZER_UNSAFE_VALUE`; the current SS2022 example proves `=` and
  `:` only inside a fixed quoted credential, while a comma is admitted only
  for the explicitly documented quoted HTTP username form;
- only directly evidenced Shadowsocks ciphers (`aes-128-gcm`, `chacha20`, and
  `2022-blake3-aes-128-gcm`) and VMess security (`aes-128-gcm`) are accepted;
  `2022-blake3-aes-256-gcm` remains blocked;
- SOCKS5 is officially documented but its ProxyFlow lowering is deferred;
  TUIC and AnyTLS remain deferred;
- proxy chains remain unproven;
- DoT and mixed encrypted/traditional DNS remain unsupported;
- native Remote Proxy Source format remains unproven;
- first-party Service Rules lowering is implemented, but its real-client
  import, load, refresh, failure, and precedence evidence remains pending.

Existing diagnostics remain visible, including
`LOON_PROXY_PROTOCOL_UNSUPPORTED`, `LOON_PROXY_CIPHER_UNSUPPORTED`,
`LOON_PROXY_VARIANT_UNSUPPORTED`, `LOON_PROXY_CHAIN_UNPROVEN`,
`LOON_DNS_DOT_UNSUPPORTED`, `LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED`,
`LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`,
`LOON_RULE_SOURCE_FORMAT_UNPROVEN`,
`LOON_SERVICE_RULE_NOT_FOUND`, `LOON_LEGACY_SERVICE_RULE_UNSUPPORTED`,
`LOON_SERVICE_RULE_SOURCE_MISSING`,
`LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`, and
`LOON_SERVICE_RULE_POLICY_CONFLICT`.

## Service Rules Foundation

The previous research blocker has been narrowed rather than broadly removed.
At `proxyflow-rules` commit `27d38e4`, `sources/services/*.json` is the canonical
source for all ten services, `scripts/generate-rules.mjs` deterministically
creates `rules/loon/*.list`, and `scripts/validate-rules.mjs` checks the exact
file matrix, generated freshness, rule syntax, and semantic parity. The
ProxyFlow catalog now registers those owned Loon assets without copying their
bodies or rule counts into the target adapter.

The current Loon Remote Rule page at source commit `65292c2` proves the remote
collection and policy relationship. LoonExampleConfig commit `dfbfc0b` proves
the `[Remote Rule]` section and `URL,policy=PROXY,enabled=true`. The serializer
uses only that named-policy and enabled form; it does not infer `tag`, interval,
format, behavior, path, type, or any general escaping grammar.

Resolution fails closed with distinct diagnostics:

- `LOON_SERVICE_RULE_NOT_FOUND` when the referenced service is absent from IR;
- `LOON_LEGACY_SERVICE_RULE_UNSUPPORTED` for historical China references;
- `LOON_SERVICE_RULE_SOURCE_MISSING` when a catalog service lacks an owned
  Loon asset.

This evidence is sufficient for the checked-in Foundation and sanitized
compiler acceptance. It is not evidence that Loon has accepted, fetched,
refreshed, cached, or recovered from failure for these particular resources.
Those observations remain **PENDING USER ACCEPTANCE**. User-provided arbitrary
rule sources remain outside the owned path and fail closed.

## Mixed Precedence Research

The manual says domain/IP matching has special behavior but does not establish
the result of an active mixed family against Universal priority. A real-client
fixture must compare deliberately conflicting `DOMAIN`/`IP-CIDR` rules before
`LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` can be removed. The acceptance fixture
therefore contains separate pure domain and pure IP profiles only.

## Open Evidence Cases

These cases are intentionally not auto-enabled by the fixture:

- Unicode beyond the tested CJK and flag/emoji candidates;
- password punctuation beyond the proven quoted `=`/`:` case and the HTTP
  username comma form;
- query-like paths and spaces;
- comma, quote, and backslash values outside the explicitly proven HTTP
  username form (and equals outside the fixed quoted credential subset);
- mixed domain/IP precedence;
- native remote proxy sources and arbitrary remote rule sources;
- first-party Remote Rule loading, refresh, persistence, and failure behavior;
- local-vs-remote and different-policy Remote Rule precedence.

Each requires pinned first-party syntax plus real-client acceptance before the
Foundation grammar or capability boundary can be widened.

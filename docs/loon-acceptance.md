REAL LOON IMPORT: PENDING USER ACCEPTANCE

# Loon Real Client Readiness

This document records the developer-only acceptance boundary for the Loon
compiler. It is not a product launch, a supported-target declaration, or proof
that a real Loon client has accepted an export.

## Baseline

- Repository: `kure29/ProxyFlow`
- Foundation baseline: merged PR #41, commit `0a16491`
- Readiness branch: `feat/loon-client-readiness`
- Tested Loon version: **PENDING USER ACCEPTANCE**
- Tested iOS version: **PENDING USER ACCEPTANCE**
- Import result: **PENDING**

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
`deferred` pending an IR audit and real-client acceptance. In this phase only
the exact SS2022 AES-128 cipher and SIP003 simple-obfs source lowering have
been added; Reality, SOCKS5, and AnyTLS remain intentionally deferred.

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

This failed attempt is preserved as `BLOCKED`; the source representation fix is
followed by `RETEST`, and only a later real-client result can establish
`PASSED`:

`BLOCKED (Attempt 1) -> FIX (source lowering/evidence update) -> RETEST REQUIRED -> PASSED (future client evidence)`

No node names, addresses, subscription URL, passwords, UUIDs, hosts, or tokens
are recorded here.

## Import Checklist

Record the client and OS versions above before changing `PENDING`.

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

Result: **PENDING**. No real-client evidence has been supplied in this phase.

## Preserved Foundation Boundaries

The readiness workflow does not relax any Foundation decision:

- mixed domain/IP route precedence remains blocked by
  `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` until real-client evidence exists;
- syntax-safe Unicode policy names are preserved for acceptance candidates;
  extended Unicode/emoji round-trip remains conditional pending real-client
  evidence;
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
- Service Rules remain unproven.

Existing diagnostics remain visible, including
`LOON_PROXY_PROTOCOL_UNSUPPORTED`, `LOON_PROXY_CIPHER_UNSUPPORTED`,
`LOON_PROXY_VARIANT_UNSUPPORTED`, `LOON_PROXY_CHAIN_UNPROVEN`,
`LOON_DNS_DOT_UNSUPPORTED`, `LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED`,
`LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`, and
`LOON_SERVICE_RULE_SOURCE_UNPROVEN`.

## Service Rules Research

Pinned LoonManual commit
[`4311d0030fe3065d4664b403a32010f083b99273`](https://github.com/Loon0x00/LoonManual/commit/4311d0030fe3065d4664b403a32010f083b99273)
was audited for `sub_rule.md`, `rule.md`, `scheme.md`, and `general.md`.

`sub_rule.md` proves a URL-plus-policy example for a collection of Loon-type
rules. It does not define a canonical ProxyFlow artifact, matcher parity,
headers or content MIME, request/auth behavior, refresh cadence, persistence,
or update/failure semantics. `scheme.md` proves user-triggered
`loon://import` and `loon://update` actions, not native rule-provider behavior.
The existing asset catalog registers Mihomo YAML and Surge LIST assets only;
there is no Loon asset. Do not copy Surge URLs or infer a Loon format.

Keep `LOON_SERVICE_RULE_SOURCE_UNPROVEN` until all of the following exist:

- a checked-in Loon rule-list artifact and deterministic generator;
- canonical matcher-parity tests;
- proven remote URL syntax and update/failure semantics;
- real-client import, refresh, and failure evidence;
- ProxyFlow asset-catalog registration after the evidence is complete.

## Mixed Precedence Research

The manual says domain/IP matching has special behavior but does not establish
the result of an active mixed family against Universal priority. A real-client
fixture must compare deliberately conflicting `DOMAIN`/`IP-CIDR` rules before
`LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` can be removed. The acceptance fixture
therefore contains separate pure domain and pure IP profiles only.

## Open Evidence Cases

These cases are intentionally not auto-enabled by the fixture:

- extended Unicode/emoji policy-name round-trip;
- password punctuation beyond the proven quoted `=`/`:` case and the HTTP
  username comma form;
- query-like paths and spaces;
- comma, quote, and backslash values outside the explicitly proven HTTP
  username form (and equals outside the fixed quoted credential subset);
- mixed domain/IP precedence;
- native remote proxy and Service Rules sources.

Each requires pinned first-party syntax plus real-client acceptance before the
Foundation grammar or capability boundary can be widened.

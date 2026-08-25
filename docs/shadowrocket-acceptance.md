# Shadowrocket Acceptance Gate

This remains a human-gated workflow. Shadowrocket is registered but paused;
the local harness does not expose the target, change `productStatus`, import a
profile into the client, or make a network request.

## Evidence classes

### 1. Checked-in deterministic fixture

Run the network-free check with:

```bash
npm run shadowrocket:acceptance
```

The artifact is `fixtures/shadowrocket/acceptance.expected.conf`. It contains
documentation-domain values and is used only for CI fixture drift, serializer
determinism, deterministic syntax shape, and network-free compiler regression
coverage.

The current deterministic SHA-256 is:

```text
dc81aa08f70797702971c85f4b256b80ad4dc10e505856ca24964d5c7f7dc5d2
```

This digest is not the hash of a private real-client traffic profile unless
the two files are actually byte-identical. It does not prove import, real
proxy traffic, strategy behavior, routing precedence, DNS behavior, or a
materialized subscription.

### 2. Private local real-client artifacts

Use the separate local-only harness. First place a private, already-materialized
subscription input file under the OS temporary directory, for example
`/private/tmp/proxyflow-shadowrocket-input.txt`. The input may contain real
endpoints and credentials, but it must never be committed.

Generate all acceptance profiles with:

```bash
npm run shadowrocket:acceptance:local -- \
  --input /private/tmp/proxyflow-shadowrocket-input.txt \
  --health-url https://your-controlled-health-endpoint.example/health \
  --profile all
```

The harness accepts only a local file path under the OS temporary directory.
It fails closed for missing, malformed, oversized, URL, repository, or Git
paths. It uses the normal local pipeline:

```text
local file → subscription parser → materialized SubscriptionSnapshot
→ Graph → Universal IR → Shadowrocket compatibility/projection → compiler
```

No URL is fetched. No private input is written back to the repository. Generated
profiles are written outside the repository under a disposable OS temporary
directory, with directory mode `0700` and artifact mode `0600`. The output
directory is removed before every run, stale private artifacts are not reused,
and the harness never automatically imports anything into Shadowrocket.

The command prints only aggregate candidate/protocol counts, diagnostic codes,
the generated private artifact path, and that artifact's own SHA-256. It never
prints endpoint names, hosts, ports, credentials, UUIDs, passwords, subscription
contents, or private node bodies. A blocked profile produces no artifact.

For `url-test` and `fallback`, `--health-url` is required. Supply a controlled
HTTP(S) health endpoint that the human can intentionally exercise; the harness
validates the URL but never fetches it. It rejects credentials, fragments, and
control characters in that value. `load-balance` does not use a health URL.

Run one profile at a time when a narrower experiment is useful:

```bash
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --profile core
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --health-url https://your-controlled-health-endpoint.example/health --profile url-test
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --health-url https://your-controlled-health-endpoint.example/health --profile fallback
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --profile load-balance
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --profile subscription
npm run shadowrocket:acceptance:local -- --profile routing
npm run shadowrocket:acceptance:local -- --profile dns
```

The core and strategy profiles require at least two distinct materialized
endpoints. The harness never duplicates an endpoint to manufacture a
two-member test. The materialized-subscription profile requires at least one
endpoint and reports only aggregate counts. `routing` and `dns` use controlled
DIRECT/REJECT or resolver inputs and do not require private credentials.

## Profile set and human observations

Each generated artifact has an independent SHA-256. Record that digest with
the corresponding observation; do not reuse the deterministic fixture hash.

### Core import, traffic, and select

Profile: `core.conf`

- Universal intent: a materialized local subscription feeding a two-or-more-member `select` group with FINAL targeting that group.
- Expected syntax: each compatible endpoint is emitted once, followed by a `select` group and FINAL.
- Human steps: import the profile, confirm the endpoints and group, select each meaningfully distinct member, send a controlled request through the selected member, and compare with a direct control request.
- PASS proves only import, endpoint recognition, select retention, FINAL selection, and the tested traffic path for that exact profile.
- FAIL disproves the corresponding claim for the tested Shadowrocket version/build; it does not justify widening the adapter.

### Strategy profiles

Profiles `url-test.conf`, `fallback.conf`, and `load-balance.conf` are separate
because each tests a different client policy. They are emitted only for the
currently implemented conditional mappings:

- `url-test`: Universal auto-select with explicit health URL and interval.
- `fallback`: ordered fallback with explicit health URL and interval; no tolerance intent is added.
- `load-balance`: explicit `round-robin`; consistent-hash remains blocked by the production compiler.

For each profile, record the exact group syntax, the member chosen by the
client, the test interval/health result where visible, and whether the observed
behavior matches the Universal intent. Do not claim semantics outside the
profile's exact emitted fields.

### Routing precedence profiles

Profiles `routing-overlap.conf` and `routing-inverted.conf` contain controlled,
credential-free experiments for DOMAIN, DOMAIN-SUFFIX, IP-CIDR, IP-CIDR6, and
GEOIP. The first profile uses the baseline priority order; the second inverts
the relevant priorities/policies so the observation is discriminating. Both
preserve Universal ordering: priority ascending, then stable IR insertion order.

Exercise a controlled request for each matcher and record the observed winner.
These profiles prove only the tested matcher combinations and orderings; they
do not prove port, ASN, GEO-SITE, rule-set, or first-party Service Rule support.

### DNS profiles

Profiles `dns-system.conf` and `dns-udp.conf` contain only the currently
emitted DNS forms:

- `dns-system`: a system resolver in the global `dns-server` list.
- `dns-udp`: the controlled IPv4 UDP resolver `192.0.2.53:53`.

Record whether Shadowrocket recognizes and uses the emitted resolver. Do not
add or claim DoH/DoT behavior; those mappings remain unsupported.

### Materialized subscription

Profile: `subscription.conf`

This uses the supplied local input through the normal parser → Universal IR →
Shadowrocket pipeline. Record only the harness aggregates:

- candidate count
- compatible count
- skipped count
- blocker count
- non-sensitive protocol counts
- diagnostic code counts
- artifact SHA-256

Never copy the input, endpoint bodies, or credentials into this document.

## Evidence record template

Replace the values only with sanitized human observations. Keep private paths,
hosts, ports, credentials, UUIDs, passwords, and subscription contents out of
this document.

```text
Shadowrocket version:
Shadowrocket build:
OS version:
ProxyFlow commit:
Acceptance date:

Deterministic fixture:
Path: fixtures/shadowrocket/acceptance.expected.conf
SHA-256: dc81aa08f70797702971c85f4b256b80ad4dc10e505856ca24964d5c7f7dc5d2
Import syntax: PASSED | FAILED | NOT RUN

Core private profile:
SHA-256:
Import: PASSED | FAILED | NOT RUN
Proxy traffic: PASSED | FAILED | NOT RUN
Select: PASSED | FAILED | NOT RUN

URL-test profile:
SHA-256:
Result: PASSED | FAILED | NOT RUN

Fallback profile:
SHA-256:
Result: PASSED | FAILED | NOT RUN

Load-balance profile:
SHA-256:
Result: PASSED | FAILED | NOT RUN

Routing precedence profiles:
<profile name>:
SHA-256:
Observed winner:
Result: PASSED | FAILED | NOT RUN

DNS system profile:
SHA-256:
Result: PASSED | FAILED | NOT RUN

DNS IPv4 UDP profile:
SHA-256:
Result: PASSED | FAILED | NOT RUN

Materialized subscription profile:
SHA-256:
Candidates:
Compatible:
Skipped:
Blockers:
Import: PASSED | FAILED | NOT RUN
Real traffic: PASSED | FAILED | NOT RUN

Sanitized observations:
Reproduction notes:
Failed claims:
Remaining unproven boundaries:
```

The deterministic fixture and every private profile have separate hashes. A
failed or missing human result keeps the target paused and the relevant
capability audit item open.

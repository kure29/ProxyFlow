# Shadowrocket Acceptance Gate

This remains a human-gated workflow for real-client behavior. Shadowrocket is
exposed only for the evidence-bounded product subset; the local harness does
not import a profile into the client or make a network request. A narrow real-client record
now exists for Shadowrocket 2.2.65 build 2615 covering standalone GEOIP,
standalone IP-CIDR, and the resulting mixed IP/GEO fail-closed boundary; it is
not generalized to other versions or builds.

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
  --dns-server 192.0.2.53:53 \
  --profile all
```

`https://your-controlled-health-endpoint.example/health` and
`192.0.2.53:53` are placeholders/documentation defaults only. Replace them
with a real reachable HTTP(S) health endpoint and a real reachable IPv4 UDP
DNS resolver for behavioral acceptance. The harness never fetches either
value during generation.

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

For `url-test` and `fallback`, omitting `--health-url` keeps the placeholder and
labels the artifact `SYNTAX_IMPORT_ONLY`. Supply a controlled HTTP(S) health
endpoint that the human can intentionally exercise for `HUMAN_INPUT_READY`.
The harness validates the URL but never fetches it. It rejects credentials,
fragments, and control characters in that value. `load-balance` does not use a
health URL.

For DNS, `--dns-server IPv4[:port]` accepts only a literal IPv4 address and an
optional port (default `53`). Hostnames, IPv6, credentials, DoH, and DoT are
rejected. Omitting the argument preserves the documentation-only UDP default
and labels the artifact `SYNTAX_IMPORT_ONLY`; a real resolver value prepares
the artifact for human behavioral testing but does not itself prove behavior.

For routing, supply whichever controlled destinations the human can actually
reach. Readiness is reported per matcher family; missing IPv6 does not block
DOMAIN, IP-CIDR, or standalone GEOIP probes:

```text
--routing-domain <domain>
--routing-ipv4 <IPv4>
--routing-ipv6 <IPv6>
--routing-geoip-country <CC>
```

For the common partial-input case (controlled domain, IPv4, and GeoIP country,
but no reachable IPv6), rerun:

```bash
npm run shadowrocket:acceptance:local -- \
  --profile routing \
  --routing-domain <controlled-domain> \
  --routing-ipv4 <controlled-IPv4> \
  --routing-geoip-country <CC>
```

The output reports `DOMAIN`, `DOMAIN_SUFFIX`, `IP_CIDR`, `IP_CIDR6`, and
`GEOIP` readiness independently. A supplied domain prepares both domain
families; a supplied IPv4 prepares IP-CIDR; and a supplied country plus IPv4
prepares GEOIP. The harness does not perform a GeoIP lookup: the human must
confirm that the controlled IPv4 belongs to the supplied country and must keep
that confirmation separate from syntax/import evidence. Without a controlled
IPv6, IP-CIDR6 remains syntax/import-only and its behavior result is `NOT RUN`.

The values are used only in generated private artifacts. Omitted values
preserve the documentation defaults. The IPv4/IPv6 values are lowered to exact
`/32` and `/128` matchers when supplied; deterministic mode retains the
checked-in-style `192.0.2.0/24` and `2001:db8::/32` values.

The `routing` convenience request now emits only the standalone GEOIP and
IP-CIDR probes. The historical `routing-overlap` and `routing-inverted`
profiles contain mixed IP/GEO precedence intent and fail closed with
`SHADOWROCKET_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`; they are not silently
reordered or downgraded.

Run one profile at a time when a narrower experiment is useful:

```bash
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --profile core
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --health-url <real-health-url> --profile url-test
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --health-url <real-health-url> --profile fallback
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --profile load-balance
npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --profile subscription
npm run shadowrocket:acceptance:local -- --profile routing --routing-domain <domain> --routing-ipv4 <IPv4> --routing-ipv6 <IPv6> --routing-geoip-country <CC>
npm run shadowrocket:acceptance:local -- --profile routing-geoip-only --routing-ipv4 <IPv4> --routing-geoip-country <CC>
npm run shadowrocket:acceptance:local -- --profile routing-ipcidr-only --routing-ipv4 <IPv4>
npm run shadowrocket:acceptance:local -- --profile dns --dns-server <IPv4[:port]>
```

The core and strategy profiles require at least two distinct materialized
endpoints. The harness never duplicates an endpoint to manufacture a
two-member test. The materialized-subscription profile requires at least one
endpoint and reports only aggregate counts. `routing` and `dns` use controlled
DIRECT/REJECT or resolver inputs and do not require private credentials.
The isolated routing probes require no subscription input.

## Profile set and human observations

Each generated artifact has an independent SHA-256. Record that digest with
the corresponding observation; do not reuse the deterministic fixture hash.

### Core import, traffic, and select

Profile: `core.conf`

- Universal intent: a materialized local subscription feeding a two-or-more-member `select` group with FINAL targeting that group.
- Expected syntax: each compatible endpoint is emitted once, followed by a `select` group and FINAL.
- Syntax/import evidence: import the profile and confirm the endpoints, group, and FINAL. Record this separately from traffic.
- Behavioral evidence: select each meaningfully distinct member, send a controlled request through the selected member, and compare with a direct control request.
- A traffic PASS requires the DIRECT-versus-proxy observation; import alone cannot be recorded as proxy behavior PASSED.
- FAIL disproves the corresponding claim for the tested Shadowrocket version/build; it does not justify widening the adapter.

### Strategy profiles

Profiles `url-test.conf`, `fallback.conf`, and `load-balance.conf` are separate
because each tests a different client policy. They are emitted only for the
currently implemented conditional mappings:

- `url-test`: Universal auto-select with explicit health URL and interval.
- `fallback`: ordered fallback with explicit health URL and interval; no tolerance intent is added.
- `load-balance`: explicit `round-robin`; consistent-hash remains blocked by the production compiler.

For each profile, record syntax/import first. Then replace the health placeholder
with a reachable endpoint where needed, observe Shadowrocket actually use that
health endpoint, and record the selected member/fallback order. A URL-test or
fallback behavioral PASS requires that observed health use and policy outcome;
the generated file alone is never a behavior PASS. Do not claim semantics
outside the profile's exact emitted fields.

### Recorded real-client evidence

The following sanitized results are pinned only to Shadowrocket 2.2.65 build
2615:

- Core profile SHA-256
  `f909cb7130eef5bcb4ab986cfcd8ece1003f71afc77c842699a7093365f525ef`:
  import PASSED; two Shadowsocks `aes-256-gcm` endpoints and the select group
  were recognized; both members were selectable; real proxy traffic and FINAL
  behavior PASSED.
- Materialized subscription profile SHA-256
  `a4babc7d0853a10ed2ace1dcd6e95377de55f90a6143e116bd7ae478a53ea53b`:
  2 candidates, 2 compatible, 0 skipped, 0 blockers; import, endpoint
  recognition, latency tests, and real proxy traffic PASSED.
- URL-test profile SHA-256
  `e0e34f2b2178c0ae6132c167d3e343469121f50c2b2985d52bee7d7ee9bbb4c3`:
  import, health checks using `https://www.gstatic.com/generate_204`, automatic
  selection, and real traffic PASSED for the exact emitted subset.
- Fallback profile SHA-256
  `0cae2d1f694f7400c9becd06e540291e3f323b0fd20a17ce293f0f645bd33d7a`:
  import, timeout of an intentionally unavailable member, healthy-member
  selection, and continued real traffic PASSED for the exact emitted subset.
- Load-balance profile SHA-256
  `4d320a73bed645ac7c1dea1cc6bfd47fde0f86b15d77ee15b7fbbe73f62d673d`:
  import, recognition of two members, traffic on both members, and observed
  round-robin behavior PASSED. No exact long-term 50/50 distribution claim is
  made.

These results do not widen protocol, strategy, health, or distribution claims
beyond the exact fields emitted in each profile.

### Routing precedence profiles

The historical profiles `routing-overlap.conf` and `routing-inverted.conf`
contain controlled, credential-free experiments for DOMAIN, DOMAIN-SUFFIX,
IP-CIDR, IP-CIDR6, and GEOIP. They are retained for evidence interpretation,
but current production compilation fails closed because the tested client did
not preserve mixed IP/GEO precedence. Policy assignments are not silently
reordered, downgraded, or flattened.

Before the fail-closed boundary was added, the profiles changed only the
relevant priorities:

- DOMAIN controlled-domain → `REJECT` priority 10; DOMAIN-SUFFIX → `DIRECT`
  priority 20. The baseline winner is `REJECT`.
- In the inverted profile, those priorities are 20 and 10 respectively. The
  expected winner is `DIRECT`.
- IP-CIDR controlled IPv4 → `REJECT` priority 30; GEOIP controlled country →
  `DIRECT` priority 50. The baseline winner is `REJECT`.
- In the inverted profile, only those priorities become 50 and 30. The
  expected winner is `DIRECT`, but only after the human confirms that the
  controlled IPv4 belongs to the supplied country.
- IP-CIDR6 remains a deterministic syntax fixture unless a real controlled
  IPv6 is supplied; without one, its behavior result is `NOT RUN`.

Both profiles preserve Universal ordering: priority ascending, then stable IR
insertion order. An unreachable documentation address or a failed request by
itself is not a routing behavior PASS.

No new mixed profile may be imported from the production compiler. These
historical artifacts prove only the exact tested observations; they do not
prove port, ASN, GEO-SITE, rule-set, or first-party Service Rule support.

### Pinned real-client routing evidence

The following record is limited to Shadowrocket 2.2.65 build 2615:

- DOMAIN-family baseline (`DOMAIN -> REJECT`, `DOMAIN-SUFFIX -> DIRECT`)
  observed `DOMAIN / REJECT`; inverted priority with unchanged policies
  observed `DOMAIN-SUFFIX / DIRECT`. DOMAIN versus DOMAIN-SUFFIX precedence
  `PASSED` for the tested domain-family subset.
- `routing-geoip-only.conf`, SHA-256
  `5befaa09cb824af60c9a74cc6f4d5dec3972b52a8dc894eceea54bc8df78b083`:
  syntax/import recorded; rule test observed `GEOIP -> DIRECT`; standalone
  GEOIP result `PASSED`.
- `routing-ipcidr-only.conf`, SHA-256
  `ec3d0a639cc7e3ed94eb38f2461201f48c428339cf747b10408bc51cbff1bb34`:
  syntax/import recorded; rule test observed `IP-CIDR -> DIRECT`; standalone
  IP-CIDR result `PASSED`.
- Mixed IP-CIDR/GEOIP: baseline observed IP-CIDR/REJECT; inverted emitted
  GEOIP/DIRECT earlier but still observed IP-CIDR/REJECT. The mixed result is
  `UNSUPPORTED / FAIL CLOSED` under the target-local diagnostic above.

This evidence does not infer GEOIP classification from physical location,
external geolocation, DNS/DDNS, or provider metadata. It does not generalize
to other Shadowrocket versions or builds. DOMAIN versus DOMAIN-SUFFIX remains
supported only within the tested domain-family boundary. IP-CIDR6 remains
syntax/import-only with behavior `NOT RUN`.

### Isolated routing probes

The client's own GEOIP classification has now been independently observed for
the pinned build. Do not infer GEOIP classification from physical server
location, an external geolocation service, DNS/DDNS, or provider metadata.

`routing-geoip-only.conf` contains only:

```text
GEOIP,<country>,DIRECT
FINAL,REJECT
```

The controlled IPv4 is used only as the human's test destination; it is not
written into this profile's generated rule. Test `http://<controlled-IPv4>/` in
Shadowrocket. Record a GEOIP standalone PASS only when the client's rule test
reports `GEOIP -> DIRECT`. If it reaches `FINAL -> REJECT`, the client's GEOIP
database did not classify that address as the supplied country, and the mixed
precedence experiment remains unresolved.

`routing-ipcidr-only.conf` contains only:

```text
IP-CIDR,<controlled-IPv4>/32,DIRECT
FINAL,REJECT
```

Test the same `http://<controlled-IPv4>/` destination. Record an IP-CIDR
standalone PASS only when Shadowrocket reports `IP-CIDR -> DIRECT`. This
establishes standalone IP-CIDR behavior independently; it does not by itself
prove precedence against GEOIP.

Because standalone GEOIP and IP-CIDR both PASSED while the inverted mixed
profile still selected IP-CIDR, the target-local
`SHADOWROCKET_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` boundary is validated for
Shadowrocket 2.2.65 build 2615. Mixed IP/GEO profiles fail closed; no
production reorder, downgrade, or flattening is attempted.

### DNS profiles

Profiles `dns-system.conf` and `dns-udp.conf` contain only the currently
emitted DNS forms:

- `dns-system`: a system resolver in the global `dns-server` list.
- `dns-udp`: the IPv4 UDP resolver supplied with `--dns-server`, or the documentation-only default `192.0.2.53:53`.

Record DNS syntax/import separately from DNS real-resolver behavior. A DNS
behavior PASS requires a human-supplied, reachable UDP resolver and an observed
client result. The documentation-only default can prove syntax/import only.
Do not add or claim DoH/DoT behavior; those mappings remain unsupported.

The pinned DNS observations for Shadowrocket 2.2.65 build 2615 are:

- `dns-system.conf`: syntax/import PASSED; general DNS-dependent browsing and
  connectivity PASSED. No specific system resolver address is claimed.
- `dns-udp.conf`: syntax/import, recognition of the human-supplied
  `1.1.1.1:53` resolver, successful answers, and normal browsing PASSED.

The UDP result proves the exact emitted IPv4 UDP resolver form and does not
prove encrypted resolver forms or other resolver roles.

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

Record subscription syntax/import separately from real traffic. A traffic PASS
requires a successful controlled request through the materialized projection.

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
Syntax/import: PASSED | FAILED | NOT RUN
Proxy traffic discriminator: PASSED | FAILED | NOT RUN
Select behavior: PASSED | FAILED | NOT RUN

URL-test profile:
SHA-256:
Syntax/import: PASSED | FAILED | NOT RUN
Health endpoint observed:
Selected member / behavior: PASSED | FAILED | NOT RUN

Fallback profile:
SHA-256:
Syntax/import: PASSED | FAILED | NOT RUN
Health endpoint observed:
Fallback behavior: PASSED | FAILED | NOT RUN

Load-balance profile:
SHA-256:
Syntax/import: PASSED | FAILED | NOT RUN
Round-robin behavior: PASSED | FAILED | NOT RUN

Routing precedence profiles:
<profile name>:
SHA-256:
DOMAIN / DOMAIN-SUFFIX:
Syntax/import: PASSED | FAILED | NOT RUN
Baseline winner:
Inverted winner:
Behavior result: PASSED | FAILED | NOT RUN

IPv4 / GEOIP:
Syntax/import: PASSED | FAILED | NOT RUN
Baseline winner:
Inverted winner:
Behavior result: PASSED | FAILED | NOT RUN
Human confirmed IPv4 belongs to GeoIP country: YES | NO | NOT RUN

IPv6:
Syntax/import: PASSED | FAILED | NOT RUN
Behavior result: NOT RUN unless a real controlled IPv6 is supplied

GEOIP standalone probe:
Profile SHA-256:
Syntax/import: PASSED | FAILED | NOT RUN
Observed matcher:
Observed policy:
Result: PASSED | FAILED | NOT RUN

IP-CIDR standalone probe:
Profile SHA-256:
Syntax/import: PASSED | FAILED | NOT RUN
Observed matcher:
Observed policy:
Result: PASSED | FAILED | NOT RUN

Mixed IP-CIDR / GEOIP precedence:
Status: UNSUPPORTED / FAIL CLOSED (pinned only to Shadowrocket 2.2.65 build 2615)
Baseline observed winner:
Inverted observed winner:
Result: UNSUPPORTED | FAIL CLOSED | NOT RUN

DNS system profile:
SHA-256:
DNS syntax/import: PASSED | FAILED | NOT RUN
DNS real resolver behavior: PASSED | FAILED | NOT RUN

DNS IPv4 UDP profile:
SHA-256:
DNS syntax/import: PASSED | FAILED | NOT RUN
DNS real resolver behavior: PASSED | FAILED | NOT RUN

Materialized subscription profile:
SHA-256:
Candidates:
Compatible:
Skipped:
Blockers:
Syntax/import: PASSED | FAILED | NOT RUN
Real traffic: PASSED | FAILED | NOT RUN

Sanitized observations:
Reproduction notes:
Failed claims:
Remaining unproven boundaries:
```

The deterministic fixture and every private profile have separate hashes. A
failed or missing human result keeps the relevant capability audit item open
and blocks the affected export; it does not justify widening the adapter.
Syntax/import acceptance and behavioral acceptance must remain separate fields;
neither one may be inferred from the other.

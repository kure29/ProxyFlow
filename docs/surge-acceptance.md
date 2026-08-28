# Surge release-candidate acceptance

## Status

The ProxyFlow compiler, compatibility checks, deterministic `.conf` export, and release-candidate fixtures are covered by automated tests.

## Evidence status

| Evidence scope | Status |
| --- | --- |
| Historical real-subscription acceptance | **PASSED** — profile generation, import, core proxy/group/routing/DNS behavior, and real proxy traffic were exercised in the recorded retest. |
| Focused Surge 1.4 Mac acceptance | **PENDING** |
| Focused Surge 1.4 iOS acceptance | **PENDING** |
| Focused G1/G2/G3-A/G3-B/G3-C behavior verification | **PENDING** |

The historical success does not substitute for the focused current-platform
acceptance required before v1.4.0 release.

## General Network / VIF (G1)

Automated compiler and Product coverage is in place for the typed,
Output-owned Surge `ipv6`, `ipv6-vif`, and `icmp-forwarding` settings. The
implementation preserves unset values, emits canonical keys in deterministic
order, and fails closed when retained intent is malformed or selected for a
different target.

**REAL SURGE DEVICE VERIFICATION (G1): NOT YET PERFORMED**

The historical real-client acceptance below covers the previously implemented
release-candidate profile. It is not evidence that the G1 General settings
have been imported or exercised on a physical Surge client.

**HISTORICAL REAL-SUBSCRIPTION ACCEPTANCE: PASSED**

The first real-world Project acceptance attempt was blocked. The failure is part of the acceptance record below and must not be reclassified as passed: a roughly 142-endpoint mixed subscription produced roughly 224 blocking diagnostics and could not be exported. The identified causes were source-wide compatibility over-validation and missing target lowering for Shadowsocks `simple-obfs`.

The corrective implementation projects only endpoints materialized by active
Surge strategies, skips replaceable incompatible pool members with an
aggregated warning, and retains blocking errors for explicit or irreplaceable
intent. The subsequent real-subscription Project retest successfully generated,
imported, and used a Surge configuration. This remains historical
real-subscription evidence; focused current Mac/iOS acceptance is still
pending. The original blocked attempt remains part of the acceptance history
below.

The checked-in fixture uses only fake `.invalid` endpoints and fixture credentials. It can validate profile parsing and structure in a real Surge client, but it cannot validate successful proxy connectivity. Replace endpoints only in a private local copy; never commit real servers, credentials, subscription URLs, or certificates.

Minimum client versions for the complete fixture are Surge iOS 5.22+ and Surge Mac 6.9+. ProxyFlow does not offer a version selector.

## Acceptance artifacts

- `fixtures/surge/release-candidate.project.json` — importable ProxyFlow Project with manual and validated-snapshot proxies, filter, URL Test, fixed strategy, two-hop chain, service and ordinary domain routing, DoH, and FINAL.
- `fixtures/surge/release-candidate.conf` — byte-stable expected output with LF line endings and all four required sections.
- `fixtures/subscriptions/surge-mixed-realistic.yaml` — synthetic 30-endpoint mixed subscription with 18 Surge-compatible and 12 intentionally incompatible candidates; every host and credential is fictional.

For the complete mixed pool, the expected product summary is `18 / 30` compatible, `12` skipped, and `0` blocking. Its HK filter subset is `7 / 10` compatible, `3` skipped, and `0` blocking.

## Real-world acceptance history

| Attempt | Result | Evidence / cause | Next action |
| --- | --- | --- | --- |
| First mixed-subscription Project, 2026-08-23 | **BLOCKED** | About 142 endpoints produced about 224 blockers. Unused and filtered endpoints were validated source-wide, and `simple-obfs` Shadowsocks was falsely rejected. | Preserve this result; do not merge based on release-candidate-only coverage. |
| Projection and `simple-obfs` correction | **RETEST REQUIRED** | Synthetic A–E scenarios cover partial pools, post-filter pools, unused VLESS inventory, explicit Fixed VLESS, and fully incompatible pools. | Repeat the real Project export and record compatible, skipped, and blocking totals plus Surge Mac/iOS import results. |
| Final real-subscription Project retest | **PASSED** | ProxyFlow generated a Surge `.conf`, Surge imported it without configuration parsing errors, and real proxy traffic worked. Compatible endpoints were emitted while incompatible pool candidates were skipped with non-blocking warnings. | Preserve this historical result; focused current Mac/iOS acceptance remains pending. |

## Historical real-subscription acceptance

- Tested with a real subscription Project (historical acceptance scope).
- ProxyFlow successfully generated a Surge `.conf`.
- Surge imported the configuration without configuration parsing errors.
- Compatible endpoints were generated normally.
- Incompatible candidate endpoints were skipped as designed and surfaced as warnings.
- Proxy and Proxy Group behavior worked normally.
- Service Rules worked normally.
- DNS worked normally.
- FINAL routing worked normally.
- Real proxy traffic worked normally.
- The remaining warnings did not block export of a valid configuration.

No real endpoint addresses, credentials, subscription URLs, tokens, or private configuration are recorded in this document.

Expected projection behavior for the retest:

| Project intent | Surge result |
| --- | --- |
| Unsupported endpoint unused by any active strategy | Ignored; it does not block or appear in the profile. |
| Unsupported endpoint in a replaceable candidate pool | Skipped and included in one aggregated warning. |
| Partially compatible pool | Export succeeds when at least one compatible member remains. |
| Fully unsupported pool | Blocked with `SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS`. |
| Explicit Fixed endpoint that Surge cannot express | Blocked; ProxyFlow never substitutes another endpoint. |

## Level 1 — ProxyFlow product workflow

1. Open the release-candidate Project fixture or reproduce the same graph in ProxyFlow.
2. Confirm Mihomo remains the default for a newly created Project, then choose Surge in the New Project or Primary Target picker.
3. Confirm the target remains Surge while compatibility is checked and that the graph, sources, processing, strategies, routes, service selection, DNS, and hidden Mihomo profile data are unchanged.
4. For the compatible fixture, confirm “Ready to export,” proxy statistics, complete `[General]`, `[Proxy]`, `[Proxy Group]`, and `[Rule]` preview sections, Copy, and Export.
5. Confirm the filename is `Surge-Release-Candidate-surge.conf`, the MIME type is `text/plain;charset=utf-8`, and the file uses UTF-8 text with LF line endings.
6. Add a VLESS proxy or a round-robin Load Balance strategy. Confirm the diagnostic message identifies the incompatible feature, the target remains Surge, editing stays available, Preview stays available for diagnostics, and Copy/Export are disabled.

Expected result: all checks pass without a page reload, silent target fallback, graph mutation, or mock configuration.

## Level 2 — Surge Mac import

Run on Surge Mac 6.9+.

1. Import `fixtures/surge/release-candidate.conf` as a new profile.
2. Confirm Surge reports no profile syntax or unsupported-field error.
3. Inspect the profile and confirm the four sections are present, `Snapshot Auto`, `Manual Fixed`, and `Release Chain` appear as policy groups, the OpenAI `RULE-SET` and ordinary `DOMAIN-SUFFIX` precede `FINAL`, and the DoH server is present.
4. Activate the profile only if the fixture endpoints have been replaced in a private copy. Confirm group selection and rule inspection remain available.

Record the exact Surge Mac version, import result, any parser message, and a screenshot of the policy groups.

## Level 3 — Surge iOS import

Run on Surge iOS 5.22+.

1. Transfer the same unmodified `.conf` through Files, AirDrop, or another local method and import it as a profile.
2. Confirm Surge reports no profile syntax or unsupported-field error.
3. Confirm `Snapshot Auto`, `Manual Fixed`, and `Release Chain` are visible, the OpenAI and ordinary-domain rules retain their order, the encrypted DNS endpoint is present, and `FINAL` targets `Release Chain`.
4. Activate only a private copy with real endpoints if connectivity testing is required.

Record the exact Surge iOS version, import result, any parser message, and screenshots of the policy groups and rule order.

## Level 4 — Runtime behavior with private endpoints

This level is optional for public release-candidate acceptance because the repository fixture is intentionally non-connectable.

1. Replace the three fake proxy endpoints and fixture credentials in a private copy while keeping the profile structure unchanged.
2. Confirm `Snapshot Auto` tests both snapshot policies and produces a usable selection.
3. Confirm `Manual Fixed` remains a one-member group.
4. Confirm `Release Chain` traverses `Snapshot Auto` before `Manual Fixed` using group-level `underlying-proxy`.
5. Confirm an OpenAI request matches the first-party `RULE-SET`, `example.org` matches the ordinary domain rule, unmatched traffic reaches `FINAL`, and DNS queries use the configured encrypted resolver.
6. Re-export from ProxyFlow and repeat the import once to rule out a one-off local edit.

Expected result: routing and chain behavior match the Project intent, with no hidden target-specific Project mutation.

## Acceptance record

| Level | Platform and version | Result | Evidence / notes |
| --- | --- | --- | --- |
| 1 | ProxyFlow automated + browser QA | Synthetic mixed workflow passed; historical real-subscription retest recorded | Automated compiler/fixture evidence is present. Browser QA at 1440×900 and 390×844 confirmed `18 / 30` compatible, `12` skipped, `0` blocking, one expandable warning, enabled Copy/Export, no horizontal overflow, and no console warnings/errors. A VLESS-only filtered pool confirmed `0 / 3`, `3` skipped, `1` blocking, `SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS`, and disabled Copy/Export. Exact Fixed VLESS remains covered by automated scenario D. Focused current Mac/iOS acceptance remains pending. |
| 2 | Surge Mac 6.9+ | Pending user acceptance | — |
| 3 | Surge iOS 5.22+ | Pending user acceptance | — |
| 4 | Private endpoint runtime | Optional / pending | — |
| Final | Real subscription Project in Surge | **Passed** | ProxyFlow-generated `.conf` imported without parsing errors; compatible endpoints, Proxy, Proxy Group, Service Rules, DNS, FINAL routing, and real proxy traffic worked. Incompatible candidates were skipped with non-blocking warnings. |

The final private real-subscription Project retest is preserved as historical
acceptance evidence. Focused current Surge 1.4 Mac/iOS import and behavior
verification remains pending; the repository fixture checklists remain
available for those platform-specific regression runs.

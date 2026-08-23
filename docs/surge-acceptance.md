# Surge release-candidate acceptance

## Status

The ProxyFlow compiler, compatibility checks, deterministic `.conf` export, and release-candidate fixtures are covered by automated tests.

**REAL SURGE IMPORT: PENDING USER ACCEPTANCE**

The checked-in fixture uses only fake `.invalid` endpoints and fixture credentials. It can validate profile parsing and structure in a real Surge client, but it cannot validate successful proxy connectivity. Replace endpoints only in a private local copy; never commit real servers, credentials, subscription URLs, or certificates.

Minimum client versions for the complete fixture are Surge iOS 5.22+ and Surge Mac 6.9+. ProxyFlow does not offer a version selector.

## Acceptance artifacts

- `fixtures/surge/release-candidate.project.json` — importable ProxyFlow Project with manual and validated-snapshot proxies, filter, URL Test, fixed strategy, two-hop chain, service and ordinary domain routing, DoH, and FINAL.
- `fixtures/surge/release-candidate.conf` — byte-stable expected output with LF line endings and all four required sections.

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
| 1 | ProxyFlow automated + browser QA | Passed 2026-08-23 | 832 full-suite tests, 84 focused tests, and responsive browser QA at 1365×768, 1440×900, 1920×1080, 375×812, 390×844, and 430×932; no console warnings or errors. |
| 2 | Surge Mac 6.9+ | Pending user acceptance | — |
| 3 | Surge iOS 5.22+ | Pending user acceptance | — |
| 4 | Private endpoint runtime | Optional / pending | — |

Do not mark real import complete until Levels 2 and 3 have been performed in actual Surge clients and their results are recorded here.

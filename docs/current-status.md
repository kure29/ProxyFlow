# ProxyFlow Autonomous Development Status

Updated: 2026-08-17

## Stable Main

- Repository: `kure29/ProxyFlow`
- Stable release: `v0.7.0`
- `origin/main`: `28c1329e1720541b17bd28ab9534ae089e6d4558`
- Product Direction PR #9 is merged.

## Integration

- Integration branch: `autopilot/v1`
- Current milestone: V0.9 - Explain & Simplify
- Current slice: Route Inspector explanation foundation
- Working milestone branch: `autopilot/v0.9`
- V0.8 milestone merge: `b0dba38f04089f3b02b81f53ab1512ab4ed5fc51` (PR #11)
- Original Slice A branch: `feat/v0.8-strategy-routing`
- Original Slice A commit: `bad3e5ab37a8958026cb47f89ac6720f3edf2cd5`
- Integrated Slice A commit: `0fb00f3` (`feat: harden strategy and routing semantics`)

## Completed

- V0.7.0 Subscription Lifecycle release
- Accepted Product Direction and V0.8 Scope Freeze
- Slice A typed matcher, routing validation, deterministic ordering, Rule Set
  references, DIRECT/REJECT/Strategy targets, target lowering, diagnostics, and tests
- Slice B unified the user-facing Routing Rule entry while preserving legacy
  `routing-group`, `service-rule`, and `custom-rule` Project nodes. Basic Service,
  Domain, CIDR, and Port matchers now share one Inspector; ASN, GeoIP, GeoSite,
  Rule Set, and numeric priority remain Advanced. Visible rule order is deterministic
  and can be moved without changing Project Schema 2.
- Slice C refined Strategy UX: Manual, Auto, and Failover are Basic entries;
  Load Balance is Advanced and target-specific, with candidate and empty-source
  explanations. Checkpoint `659591f` is pushed to `origin/autopilot/v0.8`.
- Slice D locked the V0.8 Graph -> IR -> target acceptance fixtures, including
  DIRECT, REJECT, Default Route, target-specific Failover behavior, and Project
  export/import round-trip. Checkpoint `5a41d89` is pushed to
  `origin/autopilot/v0.8`.
- Slice E added dual-target compatibility summaries to Preview while preserving
  target-specific fail-closed output. Checkpoint `444482c` is pushed to
  `origin/autopilot/v0.8`.
- Slice A integrated onto the Product Direction main baseline without rewriting the
  original branch
- V0.8 milestone PR #11 merged into `autopilot/v1`; `main` remains unchanged.
- V0.9 Route Inspector foundation adds a pure query explanation engine for
  hostname, IP, port, and service inputs. It reports first match, deterministic
  priority, Default Route, DIRECT/REJECT, strategy candidate paths, and known
  target-specific support. The empty Inspector state now exposes the same
  explanation flow in Chinese and English.

## In Progress

- V0.9 Route Inspector foundation is implemented locally on `autopilot/v0.9`.
  Focused and full validation pass; the next checkpoint is scope review and a
  push before opening the V0.9 milestone PR.

## Next

1. Commit and push the V0.9 Route Inspector foundation.
2. Add processing/strategy explanation and Basic/Advanced simplification slices.
3. Open `autopilot/v0.9 -> autopilot/v1` only after the V0.9 milestone gates pass.

## Latest Validation

- `npm test`: 374/374 passed (33 test files)
- `npm run build`: passed
- `git diff --check`: passed
- Browser QA: cold English and Chinese library/Inspector flows passed; Basic and
  Advanced strategy groups render correctly, empty candidates are explained,
  and the fresh-tab browser error/warning logs are empty
- Slice D acceptance: Graph -> IR -> Mihomo/sing-box Strategy, DIRECT, REJECT,
  Default Route, and target-specific Failover cases passed
- Slice E browser QA: cold blank project preview showed both Mihomo and sing-box
  as Supported in Chinese; sing-box preview generated JSON and fresh-tab logs
  remained free of errors and warnings
- Official binary validation (fictional fixtures, no network connections):
  Mihomo Meta `v1.19.30` Darwin arm64 (`sha256:2c7f3a7904fa1cee291e124123e630e7b1ebd13765dd9bf26c0a28432004d9f4`)
  accepted the basic routing and Failover YAML configs with `-t`; sing-box
  `v1.13.18` Darwin arm64 (`sha256:9fbc05946b584423457a2778035e0cee2d9b239a4af5ae1932d9b79991149107`)
  accepted the basic routing JSON with `check`. The sing-box Failover fixture
  remains intentionally blocked by `SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED`.
- V0.9 focused Route Inspector tests: 5/5 passed
- V0.9 browser QA: cold Chinese query for `China Mainland` explained a matched
  DIRECT rule; English switch showed Route Inspector and Matched rule copy;
  fresh console had no error or warning entries.
- Vite initial chunk: ~835.31 kB, known `>500 kB` warning
- Original Slice A PR #10: Draft, CI green, not merged

## Known Blockers

- None.

## Known Non-Blockers

- A prior subscription hydration timing fluctuation was not reproduced in three
  consecutive suites or the integration validation. It remains a V1.0 stability audit item.
- A duplicate `strategy` key and transient i18n HMR error appeared only in an
  earlier hot-reload session; neither reproduced in a fresh cold browser tab.
- The initial Vite bundle warning remains a V1.0 performance task.
- TopBar and Preview version copy still reflects V0.6 and is deferred to RC consistency work.

## Deferred

- Advanced Route Inspector semantics for external Rule Set/Geo/ASN sources: V0.9 follow-up
- Optional self-hosted Runtime Service: V0.10
- Third output target and broad protocol expansion: V1.x
- Public backend deployment, multi-user SaaS, billing, plugins, AI, cloud sync: out of scope

## Open Pull Requests

- PR #10: `feat/v0.8-strategy-routing -> main`, Draft, original Slice A checkpoint.
  Do not merge it during autonomous integration.
- PR #11: V0.8 milestone, merged into `autopilot/v1` as `b0dba38`.

## Last Checkpoint

- `b0dba38` on `autopilot/v1` (V0.8 milestone merge)
- V0.9 Route Inspector foundation is the current uncommitted checkpoint.

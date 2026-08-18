# ProxyFlow Autonomous Development Status

Updated: 2026-08-18

## Stable Main

- Repository: `kure29/ProxyFlow`
- Stable release: `v0.7.0`
- `origin/main`: `28c1329e1720541b17bd28ab9534ae089e6d4558`
- Product Direction PR #9 is merged.

## Integration

- Integration branch: `autopilot/v1`
- Current milestone: V1.0 - Stable Workflow (RC)
- Current slice: V1.0 RC2 Client-first final validation
- RC branch: `autopilot/v1.0-rc`
- Working RC2 branch: `autopilot/rc2-client-first`
- RC1 checkpoint: `2efd946b5612ffc88d553b3971a47dd4ec9ebb23`
- V0.8 milestone merge: `b0dba38f04089f3b02b81f53ab1512ab4ed5fc51` (PR #11)
- V0.9 milestone merge: `a8fc4452d53b8a6515537b66690b7fa2c109451b` (PR #12)
- V0.10 milestone merge: `ab50820fd6e0434fbbfeffb5b83503e0da94cfac` (PR #13)
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
  explanation flow in Chinese and English. Empty subscription sources are not
  treated as available candidates, and fixed Strategy endpoints resolve through
  the same explanation path.
- V0.9 Explain & Simplify now explains Processing input/output changes for
  Filter, Rename, Sort, Dedupe, Merge, and Limit through a tested pure helper.
  Strategy Inspector summaries identify candidate readiness, health-check
  settings, fallback ordering, and Advanced target-specific Load Balance.
  Chain and DNS library entries are now explicitly grouped under Advanced;
  legacy Project nodes remain readable.
- Empty new projects now expose a small first-workflow starter area that uses
  the existing Add Subscription and fictional Demo Blueprint actions. It is
  hidden as soon as a non-scaffold node exists, so the canvas remains the sole
  source of Project semantics.
- Independent milestone review fixed Route Inspector candidate counts to use
  the existing materialized Filter/Dedupe/Limit result, and made malformed IPv6
  inputs fail closed instead of matching after partial parsing.
- V0.9 milestone PR #12 passed its final CI and scope review and merged into
  `autopilot/v1`; `main` remains unchanged.
- V0.10 Runtime Service core now includes the shared Server Runtime Provider,
  SQLite active/LKG and bounded history repository, authenticated fetch
  gateway, scheduled refresh, explicit empty confirmation, restore, schedule
  endpoints, and browser connection controls. Local Mode remains independent.
- Subscription hydration now has a project-scoped async barrier: network
  refreshes wait for embedded snapshot hydration, stale barriers are replaced
  safely on rehydrate, and project changes cannot continue an old refresh.
  The regression test covers the previously observed downstream graph race.
- V0.10 PR #13 passed CI and scope review and merged into `autopilot/v1`;
  `main` remains unchanged.
- V1.0 RC user-feedback stabilization now presents one Source model through
  Subscription URL, pasted node links, and configuration-file entry points;
  legacy source node types remain readable. Region filter selections survive
  outside clicks and reloads. Routing service and Output client cards now use
  larger text, collapsible service selection, Mini service/client artwork with
  resilient text fallbacks, and the local dev server binds to `127.0.0.1`.
- V1.0 RC Mihomo output profiles now provide a target-specific Local Proxy or
  Desktop TUN preset. Mihomo lowering coordinates mixed port, LAN access,
  IPv6, Fake-IP/redir-host DNS, TUN DNS hijack, domain sniffing, selection
  persistence, unified delay, and concurrent TCP dialing. Invalid imported
  profiles fail closed; sing-box remains unchanged and Project Schema stays 2.
- V1.0 RC2 adds a shared Target Capability Registry and backward-compatible
  Primary Target metadata. New Projects choose Mihomo or sing-box before Source;
  legacy Projects infer a sole supported Output or require an explicit choice
  without deleting zero/multiple Output graphs.
- Workspace is now the default structured product surface for Sources, Proxies,
  Processing, Strategies, Routing, DNS / Advanced, Inspect, and Export. Visual
  Flow remains an on-demand view over the same Project and Graph.
- Primary Target switching is non-destructive. Source endpoints, Processing,
  Routing, incompatible Strategies, and Mihomo target-native Output Profile data
  remain available when sing-box is selected and return when switching back.
- Export now compiles Mihomo and sing-box independently. A secondary Target
  blocker is visible with diagnostic codes but does not block a valid Primary
  Target export.
- Visual Flow and Preview are lazy-loaded. The previous single `922.00 kB`
  application chunk is split; the largest current chunk is `425.67 kB`, with
  Visual Flow `19.99 kB` and Preview `9.17 kB` loaded on demand.

## In Progress

- V1.0 RC2 final validation is in progress on `autopilot/rc2-client-first`.

## Next

1. Run the final three-pass test gate, builds, browser QA, and binary validation.
2. Integrate RC2 into `autopilot/v1.0-rc` and update Draft PR #14.
3. Do not merge the RC PR, tag `v1.0.0`, or create a formal release.

## Latest Validation

- `npm test`: 440/440 passed (44 test files)
- `npm run build`: passed
- `npm run runtime:build`: passed (Node 22 SSR service bundle)
- `git diff --check`: passed
- RC2 browser QA: Workspace is the default in Chinese and English; Mihomo and
  sing-box new-project choices, structured Processing/Strategy/Routing edits,
  independent Export states, non-destructive Target switching, lazy Preview,
  desktop Visual Flow, and 390px Workspace/Target/Export layouts passed. Cold
  reload preserved the Project and produced no new browser error or warning.
- Browser QA: pasted fictional URI and Mihomo YAML imports passed; region
  selection survived outside click and reload; Routing service selection
  expanded/collapsed; enlarged service and Output client text and icon
  fallbacks rendered correctly. Cold English and Chinese reloads passed, with
  fresh-tab browser error/warning logs empty.
- Mihomo Output Profile browser QA passed in Chinese and English. Desktop TUN
  generated Fake-IP DNS, DNS hijack, and HTTP/TLS/QUIC sniffing; reload
  preserved the profile; switching back to Local Proxy removed TUN and restored
  redir-host. Fresh-tab browser error/warning logs remained empty.
- Slice D acceptance: Graph -> IR -> Mihomo/sing-box Strategy, DIRECT, REJECT,
  Default Route, and target-specific Failover cases passed
- Slice E browser QA: cold blank project preview showed both Mihomo and sing-box
  as Supported in Chinese; sing-box preview generated JSON and fresh-tab logs
  remained free of errors and warnings
- Official binary validation (fictional fixtures, no network connections):
  Mihomo Meta `v1.19.30` Darwin arm64 (`sha256:2c7f3a7904fa1cee291e124123e630e7b1ebd13765dd9bf26c0a28432004d9f4`)
  accepted the current Basic, Desktop TUN, and Failover YAML configs with `-t`; sing-box
  `v1.13.18` Darwin arm64 (`sha256:9fbc05946b584423457a2778035e0cee2d9b239a4af5ae1932d9b79991149107`)
  accepted the basic routing JSON with `check`. The sing-box Failover fixture
  remains intentionally blocked by `SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED`.
- V0.9 focused Route Inspector tests: 7/7 passed; Processing Explanation tests:
  3/3 passed; starter-state tests: 2/2 passed
- V0.9 browser QA: cold Chinese query for `China Mainland` explained a matched
  DIRECT rule; English switch showed Route Inspector and Matched rule copy;
  fresh console had no error or warning entries.
- RC1 initial chunk baseline: `859.60 kB`. Before RC2 hardening the application
  chunk reached `922.00 kB`; after safe lazy loading the largest chunk is
  `425.67 kB` and the Vite `>500 kB` warning is no longer emitted.
- Mihomo Output Profile lowering is target-specific; Desktop TUN requires an
  enabled DNS node and Fake-IP mode.
- Package candidate: `1.0.0-rc.2`; Project Schema `2`; Runtime Storage Schema `1`
- Original Slice A PR #10: Draft, CI green, not merged

## Known Blockers

- None.

## Known Non-Blockers

- Subscription hydration timing fluctuation was fixed with a deterministic
  project-scoped barrier and regression coverage; the full suite passed three
  consecutive times after the fix.
- A transient i18n Provider error can appear only while `messages.ts` is replaced
  by Vite HMR; it does not reproduce after a cold reload or in production build.
- TopBar, Preview, and starter recovery copy use the `V1.0 RC2` label.
- Node's experimental `node:sqlite` warning appears in Runtime Service tests;
  it is expected for the Node 22 MVP prerequisite and is not emitted by the browser.

## Deferred

- Advanced Route Inspector semantics for external Rule Set/Geo/ASN sources: V1.x
- Optional self-hosted Runtime Service: integrated in V0.10; remains optional
- Third output target and broad protocol expansion: V1.x
- Public backend deployment, multi-user SaaS, billing, plugins, AI, cloud sync: out of scope

## Open Pull Requests

- PR #14: `autopilot/v1.0-rc -> main`, Draft RC user-acceptance candidate. Keep
  Draft and do not merge it autonomously.
- PR #10: `feat/v0.8-strategy-routing -> main`, Draft, original Slice A checkpoint.
  Do not merge it during autonomous integration.
- PR #11: V0.8 milestone, merged into `autopilot/v1` as `b0dba38`.
- PR #12: V0.9 milestone, merged into `autopilot/v1` as `a8fc445`.
- PR #13: V0.10 milestone, merged into `autopilot/v1` as `ab50820`.

## Product Reference Backlog

- SubBoost (`https://subboost.org`) is a reference for future product reviews,
  not a scope commitment. At each relevant milestone, evaluate subscription
  management, multi-source aggregation, service presets, routing UX, chain/DNS
  flows, templates, scheduled refresh, runtime concepts, onboarding, and
  advanced disclosure as `KEEP`, `ADAPT`, `DEFER`, or `REJECT` against
  ProxyFlow's Local-first Project workflow and dual-target fail-closed model.
- No SubBoost code or implementation has been copied, and no current RC scope
  was expanded because of this reference.

## Last Checkpoint

- `955e1eb` on `autopilot/rc2-client-first` (RC2 compatibility hardening)
- `autopilot/v1.0-rc` remains the Draft PR #14 head until final RC2 integration.

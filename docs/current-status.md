# ProxyFlow Autonomous Development Status

Updated: 2026-08-22

## Stable Main

- Repository: `kure29/ProxyFlow`
- Stable release: `v0.7.0`
- `origin/main`: `75de6b8` (PR #18, restored navigation and mobile header polish)
- Product Direction PR #9 is merged.

## Responsive Layout Refactor

- Branch: `ui/responsive-layout-refactor` (based on the verified latest
  `origin/main`).
- Phase 1 — Foundations is complete at `6b66cf9` and pushed to
  `origin/ui/responsive-layout-refactor`.
- Phase 2 — Mobile Layout is complete at `533d514` and pushed to the same
  branch. Mobile now uses a `52px` safe-area-aware TopBar and `56px` bottom
  navigation; Sources / Proxies and More use focus-managed drawers. Routing
  uses two-line cards with editable targets and non-drag reorder controls, while
  DNS is a single-column, touch-sized card surface.
- Phase 3 — Desktop Workspace is complete at `571e0c1` and pushed to the same
  branch. Desktop now begins at `1024px` with a `52px` TopBar, persistent
  `200px` Sidebar, centered content, two-column Source and Proxy cards,
  counted Region/Protocol facets, a vertical Processing pipeline, compact
  Routing rows, and two-column DNS resolver cards.
- Phase 4 — Visual Flow is complete at `9678d59` and pushed to the same
  branch. Desktop uses a resizable `220px` Block Library with a `48px`
  collapsed rail, an inactive-zero / selected-`360px` Inspector with an
  explicit close control, and centered floating Canvas controls. Mobile enters
  Visual Flow explicitly from the Project menu and uses focus-managed Add Node
  and `60dvh` Inspector bottom sheets.
- Phase 5 — Modal / Export is complete at `9ec4b53` and pushed to the same
  branch. Desktop Export now pairs the ordered Target, Compatibility, Status,
  and Configuration flow with a bounded sticky code preview. Mobile uses a
  full-screen Preview, single-column Export options, bottom sheets for target
  and node selection, and an Edit / Copy / Move / Delete routing action sheet.
  Long-form dialogs and sheets include safe-area spacing, scroll lock, focus
  trapping and return, Escape handling, and touch-sized controls.
- Phase 6 — Responsive Polish is complete at `f314124` and pushed to the same
  branch. The final breakpoint sweep corrected the mobile Visual Flow grid so
  its hidden palette no longer reserves a `48px` column, restored the tablet
  Workspace navigation to a `44px` five-column rail, and made the tablet
  Inspector a usable `360px` viewport-aligned overlay.
- The semantic design system now owns the required `20/28`, `15/22`, `13/18`,
  `12/16`, and `12/16` mono type scales; `34px` standard controls; `28px`
  compact and icon controls; `44px` mobile touch targets; card padding; and the
  shared `1100px` content-width primitive.
- `DESIGN.md` and `docs/responsive-layout.md` record the new breakpoint,
  typography, spacing, sizing, and responsive-composition contract.
- Phase 1 verification: focused layout tests `8/8`, full Vitest `539/539`,
  production build passed, `git diff --check` passed, and secret review found no
  credential material. Browser smoke passed at `390px` and `1440px`: no
  horizontal overflow, no console errors or warnings, and sampled mobile
  primary/icon actions resolve to `44px` targets.
- Phase 2 verification: focused mobile/Routing/DNS tests `12/12`, full Vitest
  `539/539`, production build and diff/secret checks passed. Browser QA passed
  at `375`, `390`, and `430px` with no horizontal overflow or console issues.
  The tested `375px` shell/Routing path has no interaction below `44px`; drawer
  focus enters the first contextual item and returns to its trigger on close.
- Phase 3 verification: focused Workspace/mobile navigation/Routing/DNS tests
  `13/13`, full Vitest `539/539`, production build, diff check, and secret
  review passed. Browser QA passed at exact `1024px` and `1440px` in Chinese
  and English with a clean cold reload, no horizontal page overflow, and no
  console warnings or errors. A `390px` mobile Proxy regression pass confirmed
  one-column cards and `44px` facet controls.
- Phase 4 verification: focused panel sizing, shell state, and Inspector
  dismissal tests `8/8`, full Vitest `539/539`, production build, diff check,
  and secret review passed. Browser QA passed at `390`, `768`, `1024`, and
  `1440px`, including Chinese/English sheet copy, exact desktop panel sizing,
  zero inactive Inspector width, `48px` collapse, mobile sheet scroll lock,
  Escape/close behavior, focus return, no horizontal overflow, and no console
  warnings or errors.
- Phase 5 verification: focused Export, Routing, and Project-flow tests `7/7`,
  full Vitest `539/539`, production build, diff check, scope review, and secret
  review passed. Browser QA passed at `390`, `1024`, and `1440px` in Chinese and
  English: the desktop preview remains bounded, mobile Preview and Project
  creation are full-screen, target/routing sheets restore focus and page scroll,
  all sampled actions are `44-52px`, and cold reloads have no console warnings
  or errors.
- Phase 6 verification: focused responsive tests `15/15`; three consecutive
  full Vitest runs passed `539/539`; Web and Runtime production builds passed;
  diff, scope, and secret reviews passed. Browser QA covered `375`, `390`,
  `430`, `768`, `1024`, and `1440px` across Sources, Proxies, Processing,
  Strategies, Routing, DNS, Inspect, Export, Visual Flow, sheets, and the
  full-screen Preview in Chinese and English. No tested page has horizontal
  document overflow, and final cold loads have no console warnings or errors.
  Static UI detection reported only the specification-required `3px` active
  Sidebar indicator; no actionable UI anti-pattern remains.
- Next checkpoint: user acceptance of `ui/responsive-layout-refactor`. No merge
  to `main`, tag, or release has been performed.

## UI 2.1 Focused Polish

- Branch: `ui/2.1-focused-polish`, based on the accepted Responsive Layout
  refactor rather than the older `main` UI.
- The focused UI work adds the final ProxyFlow brand asset, responsive project
  header and direct language selector, Project Overview, de-duplicated Visual
  Flow/save status, simplified Service Rule and expanded validated custom Rule
  Source workflow, without changing Project, IR, Runtime, DNS, or Routing
  ownership semantics.
- Service artwork now restores the Clash Verge Mini visual set where an asset
  exists, uses the requested HOMOMIX Claude artwork, and provides distinct
  working Disney+, Google, and Gemini icons. Exact upstream revisions and the
  currently missing upstream repository licenses are recorded in
  `src/assets/services/SOURCES.md`.
- The ProxyFlow PNG master is cropped to its intended rounded tile with
  transparent corners. TopBar, favicon, Apple Touch Icon, and PWA icons use
  derived PNG assets without an external white canvas border.
- New Mihomo Projects now use only the supported subset of the referenced
  qichiyuhub starter configuration: mixed port 7890, LAN enabled, IPv6 disabled,
  Desktop TUN, Fake-IP DNS, sniffer, profile persistence, unified delay,
  concurrent TCP, AliDNS/DNSPod resolvers, and AliDNS bootstrap. Controller/UI,
  credentials, remote providers, and unmodeled parameters remain excluded;
  legacy Projects without a profile retain the conservative Local Proxy
  fallback.
- Icon verification passed focused service tests, full tests, production build,
  and desktop/mobile browser smoke in Chinese and English with no horizontal
  overflow or console warnings/errors. The Mihomo starter slice passes its
  Graph -> IR -> validation -> compiler tests and the full automated suite.
- No merge to `main`, tag, release, force push, or branch deletion has been
  performed.

## Integration

- Integration branch: `autopilot/v1`
- Current milestone: V1.0 - Stable Workflow (RC)
- Current slice: V1.0 RC Mobile polish integration and container publish
- RC branch: `autopilot/v1.0-rc`
- UI 2.0 branch: `autopilot/ui2`
- UI 2.0 base: `78936fee55c3fc219dd83b259c8a9821e62ecf69`
- Latest verified UI 2.0 implementation commit:
  `11f84e73cda6894fe1b6f598a18f526247f04eba`
- Accepted UI 2.0 source HEAD:
  `51a15c20cb2d24d28783eea6ac10d30b74e559b6`
- Previous RC integration merge:
  `9ecab7455c9f8b3cde2fa4f62240dfa8cbff3233`
- RC1 checkpoint: `2efd946b5612ffc88d553b3971a47dd4ec9ebb23`
- RC2 checkpoint: `a33ae2cf0fdfb73a18982a233ce2ebd37cb71dc6`
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
  application chunk is split; the largest current chunk is `426.82 kB`, with
  Visual Flow `19.99 kB` and Preview `9.17 kB` loaded on demand.
- V1.0 RC2 deployment hardening provides one versioned container with the Web
  UI, Runtime API, Subscription Fetcher, scheduler, and SQLite storage behind
  one host port and one persistent data directory. The official Bash manager
  supports install, update, start, stop, restart, status, logs, backup, and
  uninstall. It defaults to `127.0.0.1:17870`, preserves data on ordinary
  uninstall, and advances script-managed image tags without overriding explicit
  user image pins.
- Self-hosted Web and Runtime now share one origin. The browser discovers the
  same-instance backend automatically through an HttpOnly, SameSite cookie;
  external Runtime connections retain Bearer-token and exact-origin behavior.
  Local Mode and browser-local Project ownership remain unchanged.
- The Pre-UI2 checkpoint makes a newly created Project name immediately
  editable and preserves the committed name across automatic save, Project
  switching, hydration, and reload without allowing a default name to win.
- The Pre-UI2 checkpoint restores the confirmed three-flow ProxyFlow mark for
  the product shell and favicon.
- The Pre-UI2 subscription path distinguishes browser and Runtime fetches and
  classifies CORS, network, timeout, HTTP, Runtime unavailable/policy, and TLS
  failures without exposing subscription secrets or clearing Last Known Good.
- UI 2.0 Slice 1 (Foundations) adds the maintained `PRODUCT.md`, `DESIGN.md`,
  semantic design tokens, shared controls, typography, spacing, focus, motion,
  and Calm Blue status rules without replacing the existing React/CSS stack.
- UI 2.0 Slice 2 (Workspace Shell) delivers the contextual TopBar, editable
  Project switcher, Workspace / Visual Flow switch, Project-stage navigation,
  view-aware status, responsive inspector, and collapsible Flow palette.
- UI 2.0 Slice 3 (Routing) delivers Service Rule and Custom Rule creation,
  capability-aware matcher choices, concise ordered rows, drag ordering plus
  Move Up / Move Down controls, and consistent DIRECT/REJECT Final editing.
- UI 2.0 Slice 4 (DNS) adds resolver profiles, presets, protocols, roles, and
  target capability checks on the existing single DNS Graph owner. Mihomo
  preserves Default/Direct/Fallback; sing-box fails closed for unsupported
  roles and now emits a valid local bootstrap resolver for hostname DNS servers.
- UI 2.0 Slice 5 (Export) is a full Workspace page with Mihomo/sing-box Target,
  Target Configuration, independent compatibility, Preview, and target-specific
  download. No third production Target was added.
- UI 2.0 Slice 6 (Other Pages) completes Sources, Proxies, Processing,
  Strategies, Inspect, safe source presentation, filtering, runtime summaries,
  and location-aware diagnostics over the same Project/Graph.
- UI 2.0 Slice 7 (Visual Flow) applies the shared design language to the lazy
  canvas, neutral nodes, status indicators, current DNS/Final summaries, palette,
  inspector, controls, and contextual bottom status.
- UI 2.0 Slice 8 (Responsive / Accessibility / Polish) covers desktop, medium,
  and 390px layouts, compact navigation, full-screen mobile editors, 44px touch
  targets, visible focus, reduced motion, English/Chinese copy, and overflow.
- UI 2.0 Mobile acceptance polish replaces the native Workspace section select
  with an application-controlled left Drawer on tablet/mobile. It preserves all
  eight Project sections, active state, counts, 44px targets, focus return,
  Escape, close button, backdrop dismissal, scroll lock, and the persistent
  Desktop Sidebar. DNS preset actions now stay within the mobile viewport above
  the fixed status bar, avoid touch-triggered focus jumps, and retain target
  capability blocking. Checkpoint `838b45b` is pushed to `origin/autopilot/ui2`.

## Current Slice

- RC4 release branch: `release/1.0.0-rc.4`, based on current `main` at
  `75de6b8` after PR #18 restored the accepted post-PR15 UI work.
- Scope is limited to the release version advance and its deployment,
  Runtime-version, and documentation expectations. Project, Graph, IR,
  compiler, export, routing, UI, and subscription semantics remain unchanged.
- Package and immutable Compose defaults advance to `1.0.0-rc.4`; managed
  installs use the `rc` channel, explicit image pins remain fixed, and the
  container tag workflow maps RC releases to `:rc` and stable releases to
  `:latest`.
- Local automated, Web/Runtime build, deployment, TypeScript, and diff checks
  passed. PR review and CI remain pending; no tag or container publication has
  occurred.

## Remaining UI 2.0 Slices

- None. Foundations through Responsive / Accessibility / Final Polish are
  implemented in the verified checkpoint.
- The only remaining acceptance action after container publication is physical
  server/device confirmation of the Mobile Drawer and DNS touch flow. Any new
  feedback must be handled as another bounded coherent unit.

## Next

1. Open the RC4 release-only PR to `main`.
2. Wait for all CI checks and authorized review without merging autonomously.
3. After an authorized merge, tag `v1.0.0-rc.4`, confirm both immutable and
   `rc` channel tags resolve to one digest, then hand the update command to
   Self-hosted users.

## Latest Validation

### V1.0 RC4 release preparation

- `npm test` passed 561/561 tests across 66 files. The expected Node 22
  experimental SQLite notice was the only test warning.
- Web and Runtime production builds passed; `runtime-dist/server.js` is
  `214.41 kB`.
- Deployment manager tests passed 19/19, including RC2 migration, RC3-to-RC4
  managed update, manual pin preservation, `rc -> :rc`, and
  `stable -> :latest`.
- `npx tsc -b` and `git diff --check` passed.

### V1.0 RC3 finalization

- `npm test` passed 549/549 tests across 61 files. The expected Node 22
  experimental SQLite notice was the only test warning.
- Web and Runtime production builds passed; the largest Web chunk is
  `475.79 kB`, and `runtime-dist/server.js` is `214.41 kB`.
- Deployment manager tests passed 18/18, including default `:rc`, legacy RC2
  managed migration, explicit manual pin preservation, `stable -> :latest`,
  invalid-channel rejection, update version reporting, backup, and health gates.
- `npx tsc -b`, Bash syntax, fictional Compose config, and `git diff --check`
  passed.
- Browser QA passed in Chinese and English at 375, 390, 430, 768, 1023, 1024,
  and 1440px. The Config / Blueprint switch center delta is exactly `0px` at
  every measured viewport, mobile TopBar controls are `44px`, document overflow
  is `0px`, and mobile cold reload produced no console warning or error.
- Desktop shows `Current project · name` on one baseline. Mobile and tablet show
  only `ProxyFlow`, keep Project management on Project Overview, and expose only
  Export plus the distinct global overflow on the right.
- The Impeccable mechanical detector reported only the pre-existing,
  specification-required `3px` active Workspace navigation indicator; no new
  TopBar or Project Overview finding was reported.

### V1.0 pre-release integration

- UI 2.0 source HEAD `53c2879e6c8715a7c721b1b7ba79dfca258219a7`
  was merged without conflicts into `autopilot/v1.0-rc` at
  `9ecab7455c9f8b3cde2fa4f62240dfa8cbff3233`; both parents and the complete UI2
  checkpoint history are retained.
- The integrated merge passed `npm test` three consecutive times at 534/534
  tests across 57 files. The expected Node 22 experimental SQLite notice was
  the only test warning.
- `npm run build` and `npm run runtime:build` passed. The largest Web chunk is
  `459.66 kB`; `runtime-dist/server.js` is `214.41 kB`.
- Browser smoke QA passed at 1440px and 390px for Project create, rename,
  persistence, Runtime connection and subscription gateway handling,
  Workspace, Routing, DNS, Export, Visual Flow, Mihomo preview, and sing-box
  preview. Both viewports had no horizontal page overflow, mobile Routing used
  a full-width editor with 44px editor controls, and cold-reload browser
  error/warning logs were empty.
- Runtime Service connected through the isolated local development service.
  The current environment's outbound resolution was blocked by the Runtime
  SSRF policy and surfaced the sanitized `SUBSCRIPTION_RUNTIME_POLICY_BLOCKED`
  diagnostic as designed; automated Runtime success/failure coverage remained
  green.
- `git diff --check`, scope review, local-path review, and secret-pattern review
  passed. Mihomo and sing-box remain the only production Targets; Preview's
  disabled future-target entries remain non-production and non-actionable.

### UI 2.0 Mobile acceptance polish

- Verified implementation commit:
  `11f84e73cda6894fe1b6f598a18f526247f04eba` (functional fix checkpoint
  `838b45b26928a55a72ee79d7b85c28688730ce86`).
- Focused Mobile navigation, DNS mutation/capability/target export, resolver
  profile, and Project persistence suites passed at 56/56 tests. The final full
  `npm test` gate passed 539/539 tests across 59 test files.
- `npm run build` passed. Final chunks: main `272.10 kB`, target compile path
  `460.00 kB`, Visual Flow `23.14 kB`, Preview `8.95 kB`; no `>500 kB` warning.
- `npm run runtime:build` passed with `runtime-dist/server.js` at `214.41 kB`.
- `git diff --check`, staged diff check, scope review, local-absolute-path and
  secret-pattern review passed. The UI mechanical design detector returned no
  findings.
- In-app Chromium browser QA passed at 390x844, 393x852, 430x932, and 1440x900.
  The Drawer stayed at 86vw / 336px maximum on phones, retained active state and
  counts, closed after navigation, returned focus on Escape, restored scrolling,
  and produced no horizontal page overflow. Desktop retained the persistent
  Sidebar and absolute DNS menu behavior.
- DNS Mobile browser QA added Cloudflare/Google/AliDNS presets, edited fields and
  Mihomo resolver role, deleted resolvers, reloaded persisted Project state,
  checked Project Health, and previewed real Mihomo YAML plus sing-box JSON with
  the expected DNS endpoints. sing-box Direct/Fallback roles remained disabled;
  retained unsupported state surfaced `SINGBOX_DNS_ROLE_UNSUPPORTED` and blocked
  that target rather than pretending success.
- Browser QA simulated touch-sized responsive layouts; a real iOS Safari device
  was not available in this environment, so physical-device acceptance remains
  explicitly pending.
- The final cold-load 390px smoke passed after moving test-only navigation logic
  out of React component modules; the restarted dev server emitted no component
  Fast Refresh warnings.

### UI 2.0 checkpoint

- Verified implementation commit:
  `c5e1a920d6f995411860d5fa9f165846b63dc149`.
- Focused Routing, DNS, Export, Workspace/Flow, persistence, validation, and
  target fail-closed suites passed; the final full `npm test` gate passed
  three consecutive times at 534/534 tests across 57 test files.
- `npm run build` passed. Final chunks: main `268.95 kB`, target compile path
  `459.66 kB`, Visual Flow `23.14 kB`, Preview `8.95 kB`; no `>500 kB` warning.
- `npm run runtime:build` passed with `runtime-dist/server.js` at `214.41 kB`.
- `git diff --check`, staged diff check, scope review, and tracked/untracked
  secret-pattern review passed. The UI mechanical design detector returned no
  findings.
- Browser QA passed in Chinese and English at 1440px, 1024px, and 390px.
  Workspace, Routing, DNS, Export, responsive/full-screen editors, and Visual
  Flow produced no horizontal page overflow. Mobile editor controls measured
  44px. Cold reloads had empty error/warning logs, the three-flow mark loaded,
  and the favicon used the same mark.
- Workspace Final target edit -> Visual Flow -> Workspace -> cold reload kept
  the same DIRECT/REJECT semantics; the temporary QA edit was restored to
  DIRECT. Final validation and node summaries no longer contradict the stored
  target.
- Official binary validation used current credential-free Default DoH output.
  Mihomo Meta `v1.19.30` accepted YAML with `-t`; sing-box `v1.13.18` accepted
  JSON with `check`. Download archive SHA-256 values matched the recorded
  `2c7f...d9f4` and `9fbc...9107` checksums.
- Package candidate remains `1.0.0-rc.2`; Project Schema remains `2`; Runtime
  Storage Schema remains `1`.

### Earlier RC2 evidence

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
- RC2 Self-hosted browser QA: one Node process served the production Web build
  and Runtime API; Chinese and English automatic backend connection, cold
  reload, HttpOnly cookie auth, and the 390px Runtime status panel passed. The
  panel stayed inside the viewport and fresh error/warning logs were empty.
- Deployment manager focused tests: 16/16 passed. Compose config validation,
  Web build, Runtime build, and the non-Docker same-origin service smoke passed.
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
  `426.82 kB` and the Vite `>500 kB` warning is no longer emitted.
- Mihomo Output Profile lowering is target-specific; Desktop TUN requires an
  enabled DNS node and Fake-IP mode.
- Package candidate: `1.0.0-rc.2`; Project Schema `2`; Runtime Storage Schema `1`
- Original Slice A PR #10: Draft, CI green, not merged

## Known Blockers

- None.

## Known Non-Blockers

- The Mobile Drawer and DNS fixes passed Chromium responsive/touch-oriented QA,
  but still require the user's physical iOS Safari acceptance check; simulator
  QA is not represented as a real-device pass.

- Subscription hydration timing fluctuation was fixed with a deterministic
  project-scoped barrier and regression coverage; the full suite passed three
  consecutive times after the fix.
- A transient i18n Provider error can appear only while `messages.ts` is replaced
  by Vite HMR; it does not reproduce after a cold reload or in production build.
- UI 2.0 keeps the RC version as muted metadata and hides it in the mobile brand
  treatment; it is not a primary status badge.
- Node's experimental `node:sqlite` warning appears in Runtime Service tests;
  it is expected for the Node 22 MVP prerequisite and is not emitted by the browser.
- Docker client, Compose, and Buildx are installed locally, but the Docker daemon
  was unavailable during RC2 deployment validation. Real container lifecycle QA
  is therefore `NOT RUN — Docker daemon unavailable`; mocked manager tests cover
  the non-destructive CLI paths, and the GitHub container workflow remains the
  image-build gate.

## Deferred

- Advanced Route Inspector semantics for external Rule Set/Geo/ASN sources: V1.x
- Optional self-hosted Runtime Service: integrated in V0.10; remains optional
- Third output target and broad protocol expansion: V1.x
- Public backend deployment, multi-user SaaS, billing, plugins, AI, cloud sync: out of scope

## Open Pull Requests

- PR #14: `autopilot/v1.0-rc -> main`, RC user-acceptance candidate. Update it
  with the integrated UI 2.0 evidence and prepare it for review, but do not
  merge it autonomously.
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

- `9ecab7455c9f8b3cde2fa4f62240dfa8cbff3233` is the verified RC integration
  merge of accepted UI 2.0 source HEAD
  `53c2879e6c8715a7c721b1b7ba79dfca258219a7`.
- UI 2.0 was based on Pre-UI2 checkpoint
  `78936fee55c3fc219dd83b259c8a9821e62ecf69`. PR #14 must not be merged
  autonomously.

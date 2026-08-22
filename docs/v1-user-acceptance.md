# ProxyFlow V1.0 RC5 / UI 2.0 User Acceptance

Candidate: `1.0.0-rc.5` on `release/1.0.0-rc.5`

Status: UI 2.0 user acceptance and RC5 focused validation pending; not a formal
release.

This checklist validates the ordinary Client-first workflow and the UI 2.0
product surface. It does not require knowledge of the Graph, Universal IR, or
target configuration syntax.

## Before You Start

- Use fictional fixtures or a subscription you are authorized to process.
- Treat runtime snapshots as sensitive local data. They may contain normalized
  credentials and are not encrypted by ProxyFlow.
- Start Local Mode with `npm install` and `npm run dev`.
- Test Chinese and English with a cold reload after each locale switch.
- Record browser, browser version, OS, viewport, locale, and Primary Target for
  every `PARTIAL` or `BLOCKED` result.

Use at least these viewports:

| Class | Width | Expected shell |
| --- | --- | --- |
| Desktop | `1440px` | sidebar + main + optional non-modal inspector |
| Medium | about `1024px` | compact navigation + overlay inspector |
| Mobile | `390px` | single column + compact section selector + full-screen editor |

## 0. Pre-UI2 Regression Check

- Create a new Project, immediately rename it, wait for automatic save, reload,
  switch to another Project, and switch back. Confirm the name never returns to
  the localized default.
- Confirm the TopBar and browser favicon use the same three blue flow lines,
  without letters, arrows, glow, or an alternative mark.
- Refresh a URL Source in Local Mode and through a connected Runtime Service.
  Confirm the visible failure category distinguishes CORS, network, timeout,
  HTTP, Runtime unavailable/policy, and TLS failures where applicable.
- Confirm errors do not expose the subscription URL, token, response body, or
  credentials and do not clear an existing Last Known Good snapshot.

Stop and treat any failure in this section as a regression of the verified
Pre-UI2 checkpoint.

## 1. Create Project And Shell

- Open the Project menu and create one Mihomo Project and one sing-box Project.
- Confirm Target selection appears before Source selection.
- Confirm Workspace is the default view and Visual Flow remains available in
  the view switcher.
- Confirm the TopBar prioritizes the ProxyFlow mark, editable Project name,
  view switcher, save/Runtime state, Preview, and Export.
- Confirm language selection is in the overflow menu and canvas actions appear
  only in Visual Flow.
- Confirm the RC version is muted metadata and is hidden from the mobile brand
  treatment.

## 2. Workspace Navigation

- Confirm the Project navigation contains Sources, Proxies, Processing,
  Strategies, Routing, DNS / Advanced, Inspect, and Export in both languages.
- Confirm counts are secondary and issues use a small semantic status cue rather
  than module-specific colors.
- Visit every section and confirm Page Title, description, primary action,
  spacing, borders, controls, and helper text follow one hierarchy.
- Confirm Workspace never shows canvas-only node, connection, or zoom controls
  in its main navigation.

## 3. Sources And Proxies

- Add a Subscription URL, paste fictional node links, and import a local
  Mihomo/sing-box configuration file.
- Confirm Refresh and Refresh All appear on Sources rather than every TopBar
  context.
- Confirm detected, usable, and unsupported counts are visible without exposing
  passwords, UUIDs, full proxy URIs, or URL query tokens.
- Add a second Source and confirm each Source keeps independent runtime state.
- Open Proxies and review Name, Protocol, Region, Source, and Primary Target
  compatibility.
- Confirm incompatible endpoints remain in the Project when Primary Target
  changes.

## 4. Processing And Strategies

- Create Filter, Rename, Sort, Dedupe, Merge, and Limit steps as needed.
- Confirm the ordered Processing list shows a concise summary and input/output
  state without requiring Visual Flow.
- Reorder or reconnect a Processing input, then verify the same connection in
  Visual Flow and through undo/redo.
- Create Manual and Auto Strategies and select real candidate inputs.
- For Mihomo, verify Failover and Advanced Load Balance capability labels.
- For sing-box, confirm unsupported Strategy creation is blocked while existing
  incompatible Strategy data remains visible.
- Confirm Strategy cards show kind, candidate readiness, and capability without
  using a permanent module color.

## 5. Routing

- Choose Add Rule and confirm the first choice is Service Rule or Custom Rule.
- Choose Service Rule, search for OpenAI, select it, and assign a Strategy,
  `DIRECT`, or `REJECT` target.
- Repeat with Claude and confirm the neutral `C` fallback is used instead of an
  unrelated brand mark.
- Confirm the normal list shows service name, matcher/rule-count summary,
  target, status, order, and actions. It must not require users to understand a
  provider namespace or show `ios_rule_script` as the main concept.
- Choose Custom Rule and create Domain, Domain Suffix, Domain Keyword, IPv4/IPv6
  CIDR, and Port examples.
- Confirm ASN, GeoIP, GeoSite, Rule Set, raw matcher, and source provenance stay
  in Advanced experiences and follow Primary Target capability declarations.
- Reorder two rules by drag, then by Move Up / Move Down. Confirm visible order
  and generated order remain deterministic.
- Disable a rule, break a target reference, and enter an invalid matcher in
  separate checks. Confirm neutral, warning, error, and disabled states are
  distinguishable by more than color.
- On Desktop, open a rule and confirm the right inspector does not obscure the
  list with a full-page backdrop. Confirm Medium uses an overlay and Mobile a
  full-screen editor.

## 6. DNS

- Add DNS and confirm the preset list includes System, Cloudflare, Google,
  Quad9, AliDNS, DNSPod, and AdGuard DNS.
- In a Mihomo Project, create this resolver set:

```text
Default   Cloudflare
Direct    AliDNS
Fallback  Google
```

- Confirm each row exposes Name, Protocol, Endpoint, Role, Enabled, and Remove
  controls and remains readable without horizontal scrolling.
- Confirm Mihomo maps Direct and Fallback roles without a compatibility error.
- Switch the same Project to sing-box. Confirm all resolver data remains, while
  Direct and Fallback are visibly unsupported and compilation fails closed with
  `SINGBOX_DNS_ROLE_UNSUPPORTED`.
- Change sing-box resolvers to Default roles and confirm the supported
  configuration can compile.
- Confirm System is available for sing-box but is not presented as supported by
  the current Mihomo lowering.
- Remove every resolver and confirm the empty state explains how to add one.
- Reload, switch Projects, export/import the Project, and confirm resolver names,
  protocols, endpoints, roles, order, and enabled state persist.
- Import a legacy Schema 2 Project with the old single `resolver` field and
  confirm it appears as one Default resolver without a schema bump.

## 7. Inspect / Project Health

- Confirm diagnostics are grouped or presented with severity, human-readable
  text, stable code, target where relevant, and a location action when one is
  available.
- Use Route Inspector with a fictional hostname, documentation IP, port, or
  service and confirm it explains the first matched rule, target, and candidate
  path.
- Confirm export blockers identify the affected semantic and recovery action.
- Confirm raw IR and source provenance remain Advanced details.

## 8. Export

- Open Export and confirm only Mihomo and sing-box are production Target cards.
  Future Targets must not look selectable or ready.
- Confirm each card shows the full target name, readiness/blocker state, node
  count, and diagnostic codes without clipping.
- Select Mihomo and review Network, proxy port, LAN access, TUN preset, DNS
  summary, and collapsed Advanced options.
- Select sing-box and confirm the page does not pretend unsupported
  target-specific settings exist.
- Preview and download each valid Target. Confirm Mihomo produces YAML and
  sing-box produces JSON from the real compilers.
- Create a semantic supported only by Mihomo. Confirm sing-box is blocked with
  an exact code while a valid Mihomo Primary Target can still Preview and
  Export.
- Make sing-box Primary and confirm its own blocker disables only its final
  action.

## 9. Primary Target Switching

- Switch Mihomo to sing-box and confirm Source endpoints, Processing, Routing,
  incompatible Strategies, DNS roles, and Mihomo Output Profile data remain in
  the Project.
- Switch back to Mihomo and confirm the prior Mihomo Output Profile and DNS
  intent return.
- Confirm undo and redo include the Primary Target change.
- Confirm UI controls, compatibility copy, and compiler result agree with the
  selected Target Capability Registry entry.

## 10. Visual Flow Round-Trip

- Make an edit in every ordinary Workspace stage, open Visual Flow, and confirm
  it displays the same nodes, connections, order, and target references
  immediately.
- Edit an existing node or connection in Visual Flow, return to Workspace, and
  confirm the structured view reflects it without a conversion command.
- Save and cold reload, then confirm both views still represent identical
  semantics.
- Confirm the Visual Flow palette can collapse and the canvas remains the main
  visual area.
- Confirm node types use neutral surfaces, selected nodes use Primary Blue,
  warning/error indicators use semantic status colors, and dimmed nodes remain
  readable.
- Confirm node/connection/zoom status is contextual to Visual Flow.

## 11. Responsive QA

At `1440px`, complete the full workflow with the sidebar and non-modal
inspectors. At about `1024px`, check sidebar/palette behavior, overlay
inspectors, Target cards, and Export actions.

At `390px`, complete this sequence without entering Visual Flow:

```text
Create -> Source -> Strategy -> Routing -> DNS -> Inspect -> Export
```

Confirm:

- there is no horizontal page scroll or clipped Target/action text;
- the section selector preserves Project -> Section -> Content hierarchy;
- editors use the full available screen and do not create nested scroll traps;
- touch targets are at least `44px`;
- Routing reorder does not require a small drag handle;
- Visual Flow remains available for overview, navigation, and inspection.

## 12. Accessibility And Icon QA

- Navigate the TopBar, Project menu, Workspace navigation, add menus, lists,
  inspectors, dialogs, and Export actions by keyboard.
- Confirm visible focus, semantic button/label roles, Escape handling, and focus
  return after dialogs close.
- Confirm status and destructive actions are not communicated by color alone.
- Confirm body/helper text and status colors have a reasonable WCAG AA contrast
  baseline.
- Confirm controls use one Lucide stroke style. Check ProxyFlow, Mihomo,
  sing-box, OpenAI, Claude, Telegram, YouTube, and Netflix artwork/fallbacks for
  missing assets, broken images, or incorrect substitutions.

## 13. Optional Runtime Service

Runtime Service is not required for Local Mode.

- Run `./scripts/proxyflow.sh install` with Docker available, or use the
  repository Compose file with fictional environment values.
- Confirm the service opens on `http://127.0.0.1:17870` by default and the Web
  UI discovers its same-origin backend without Runtime URL/token entry.
- Run `status`, `restart`, `backup`, and `uninstall`; confirm health is checked,
  a timestamped backup is created, and normal uninstall preserves Runtime data.
- Refresh a URL Source through the service and confirm success or a stable,
  actionable, sanitized error category.
- Verify scheduled refresh, bounded history, restore, and explicit empty-result
  confirmation.
- Disconnect the service and confirm Local Mode remains independently usable.
- For a public domain, verify the reverse proxy uses HTTPS plus separate access
  control and forwards `Host` and `X-Forwarded-Proto`.

## 14. Save, Reload, And Import

- Reload and confirm Project name, Primary Target, graph edits, routing order,
  DNS profiles, and target-native settings persist.
- Export and re-import the Project and confirm Workspace and Visual Flow show the
  same semantics.
- Import a V0.7 Project Schema 2 Project with zero, one, and multiple Outputs.
- Confirm one supported Output is inferred; zero or multiple Outputs require a
  user choice without deleting graph data.
- Import an unknown schema and confirm ProxyFlow fails closed with recovery.
- Confirm Project Schema remains `2` and Runtime Storage Schema remains `1`.

## 15. Privacy, Console, And Performance

- Confirm Project Export excludes runtime snapshots, Runtime Service tokens,
  normalized credentials, response bodies, local paths, and history.
- Confirm diagnostics and compatibility summaries never expose subscription
  URLs, query tokens, proxy credentials, or response bodies.
- Cold reload each tested viewport and locale. Confirm there are no new React,
  hydration, missing-key, controlled-input, failed-asset, favicon, error, or
  warning console entries related to UI 2.0.
- Confirm Visual Flow and Preview remain lazy-loaded and record initial/lazy
  chunk sizes against the Pre-UI2 baseline.

## Automated Gates

Record all results against the final branch HEAD:

```text
npm test                  run 1
npm test                  run 2
npm test                  run 3
npm run build
npm run runtime:build
git diff --check
scope review
secret review
```

Compiler behavior changes also require representative Mihomo and sing-box
binary validation with fictional fixtures where the affected output can be
accepted by that target.

## Acceptance Result

User acceptance passed on 2026-08-20. The accepted UI 2.0 source HEAD
`53c2879e6c8715a7c721b1b7ba79dfca258219a7` was integrated into
`autopilot/v1.0-rc` by merge commit
`9ecab7455c9f8b3cde2fa4f62240dfa8cbff3233`. The integrated merge repeated the
534/534 test gate three times, both builds, diff/scope/secret checks, and the
desktop/390px browser smoke flows before PR review handoff.

### UI 2.0 checkpoint — 2026-08-20

Verified implementation commit:
`c5e1a920d6f995411860d5fa9f165846b63dc149` on `autopilot/ui2`.

- Sections 1-12: `PASS` through focused tests, three consecutive full test
  passes, and Chinese/English browser QA at desktop, medium, and 390px. The
  checked flows include Workspace navigation, Routing, DNS, Export, responsive
  inspectors, accessibility labels/touch targets, and Visual Flow round-trip.
- Section 13: `PARTIAL` only for the unchanged real Docker lifecycle check.
  Runtime tests and the Runtime build pass; the previously recorded Docker
  daemon limitation remains. Local Mode and current UI 2.0 do not require the
  Runtime Service.
- Sections 14-15: `PASS`. Project/Graph persistence and round-trip tests pass;
  cold English and Chinese reloads have empty browser error/warning logs; the
  three-flow logo and favicon load; scope and tracked/untracked secret scans are
  clean; and lazy chunks remain below the warning threshold.
- Automated gates: `npm test` passed 534/534 tests in 57 files three consecutive
  times; Web and Runtime builds passed; `git diff --check` and the UI mechanical
  detector passed with no findings.
- Representative official target validation: current credential-free Default
  DoH output passed Mihomo Meta `v1.19.30 -t` and sing-box `v1.13.18 check`.
  This validation found and fixed the missing sing-box DNS bootstrap resolver
  before the final gates were repeated.

Record each numbered section as `PASS`, `PARTIAL`, or `BLOCKED`. A `PARTIAL`
result must name the target-specific limitation. A `BLOCKED` result must include
the visible diagnostic and recovery step.

Do not declare UI 2.0 ready until the three full test runs, both builds, diff
check, browser/console QA, Workspace/Visual Flow round-trip, and migration checks
all pass on the same final HEAD.

Node's experimental `node:sqlite` warning is expected for the current Node 22
Runtime Service prerequisite and is not a browser warning.

## Current Boundaries

- Mihomo and sing-box are the only production Targets.
- Local Mode remains independently usable without Runtime Service.
- Browser CORS, unsupported protocols, external rule resources, and target
  capability differences remain explicit limitations.
- sing-box Direct/Fallback DNS resolver roles remain intentionally unsupported
  until they can be represented without semantic loss.
- Dark Mode is not part of the UI 2.0 Light Mode acceptance gate.
- There is no third Target, cloud sync, multi-user account system, public
  backend, plugin marketplace, or AI configuration generation in RC5.

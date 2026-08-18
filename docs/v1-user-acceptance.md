# ProxyFlow V1.0 RC2 User Acceptance

Candidate: `1.0.0-rc.2`

Status: Draft for user acceptance; not a formal release.

This checklist follows the ordinary Client-first workflow. It does not require
knowledge of the Graph, Universal IR, or target configuration syntax.

## Before You Start

- Use a current desktop browser and one 390px-class mobile viewport.
- Start Local Mode with `npm install` and `npm run dev`.
- Use fictional fixtures or a subscription you are authorized to process.
- Treat runtime snapshots as sensitive local data. They may contain normalized
  credentials and are not encrypted by ProxyFlow.

## 1. Create Project

- Open the project menu and choose New Project.
- Confirm Target selection appears before Source selection.
- Confirm the default landing surface is Workspace, not Visual Flow.

## 2. Choose Client

- Create one Mihomo Project and one sing-box Project.
- Confirm the selected client is shown as the Primary Target.
- Confirm Strategy and Routing creation choices reflect the selected Target.
- Confirm unsupported choices are disabled or clearly marked instead of being
  silently approximated.

## 3. Add Subscription

- Add a Subscription URL, paste fictional node links, or import a local
  Mihomo/sing-box configuration file.
- Confirm detected, usable, and unsupported counts are visible without exposing
  passwords, UUIDs, full proxy URIs, or URL query tokens.
- Add a second Source and confirm each Source keeps independent runtime state.

## 4. Review Compatibility

- Open Proxies and review protocol, region, Source, and Primary Target status.
- Confirm incompatible endpoints remain in the Project.
- Confirm changing Primary Target does not delete or rewrite Source endpoints.

## 5. Process Nodes

- Create a Filter and select its Source input in Workspace.
- Add Rename, Sort, Dedupe, Merge, or Limit as needed.
- Confirm input changes update the same connections shown in Visual Flow.
- Confirm undo and redo restore both data and connections.

## 6. Create Strategy

- Create Manual and Auto Strategies and select real candidate inputs.
- For Mihomo, verify Failover and Advanced Load Balance capability labels.
- For sing-box, confirm unsupported Strategy creation is blocked while existing
  incompatible Strategy data remains visible.

## 7. Create Routing

- Add Service, Domain, CIDR, and Port Routing Rules.
- Assign a Strategy, `DIRECT`, or `REJECT` target.
- Move two rules using the accessible Move Up/Move Down controls.
- Confirm visible order and generated order remain deterministic.

## 8. Inspect

- Open Source, Processing, Strategy, and Routing editors from Workspace.
- Use Route Inspector with a fictional hostname, documentation IP, port, or
  service and confirm it explains the matched rule, target, and candidate path.
- Confirm export blockers identify the affected semantic and recovery action.

## 9. Export Primary Target

- Open Export and confirm the Primary Target appears first.
- Preview and export the Primary Target.
- Confirm generated output comes from the real compiler and never from a mock or
  silent fallback.

## 10. Check Secondary Target

- Review the secondary Target independently.
- When the secondary Target has blockers, confirm its export is disabled with
  exact diagnostic codes.
- Confirm a blocked secondary Target does not block a valid Primary Target.

## 11. Switch Primary Target

- Open the Primary Target switcher and review both compiler results.
- Switch Mihomo to sing-box and confirm Source, Processing, Strategy, Routing,
  and target-native settings remain in the Project.
- Switch back to Mihomo and confirm the prior Mihomo Output Profile returns.
- Confirm undo and redo include the Primary Target change.

## 12. Visual Flow

- Open Visual Flow and confirm it shows the Workspace edits immediately.
- Change one existing node in Visual Flow and confirm Workspace reflects it.
- Confirm Visual Flow remains an advanced topology view, not a second Project.

## 13. Mobile

- At a 390px-class viewport, complete Source review, Strategy editing, Routing,
  Inspect, Export, and Primary Target switching from Workspace.
- Confirm controls remain readable and touchable without precise canvas work.
- Open Visual Flow and confirm the topology overview is available.

## 14. Optional Runtime Service

Runtime Service is not required for Local Mode.

- Run `./scripts/proxyflow.sh install` with Docker available, or use the
  repository Compose file with fictional environment values.
- Confirm the service opens on `http://127.0.0.1:17870` by default and that a
  Self-hosted instance discovers its backend without Runtime URL/token entry.
- Run `status`, `restart`, `backup`, and `uninstall`; confirm health is checked,
  a timestamped backup is created, and normal uninstall preserves Runtime data.
- Refresh a URL Source through the service and confirm Last Known Good behavior.
- Verify scheduled refresh, bounded history, restore, and explicit empty-result
  confirmation.
- Disconnect the service and confirm Local Mode remains independently usable.
- For a public domain, verify the reverse proxy uses HTTPS plus separate access
  control and forwards `Host` and `X-Forwarded-Proto`.

## 15. Save, Reload, And Import

- Reload the browser and confirm Primary Target, graph edits, ordering, and
  target-native settings persist.
- Export and re-import the Project and confirm Workspace and Visual Flow show the
  same semantics.
- Import a V0.7 Project Schema 2 Project with zero, one, and multiple Outputs.
- Confirm one supported Output is inferred; zero or multiple Outputs require a
  user choice without deleting graph data.
- Import an unknown schema and confirm ProxyFlow fails closed with recovery.

## Privacy Check

- Confirm Project Export excludes runtime snapshots, Runtime Service tokens,
  normalized credentials, response bodies, local paths, and history.
- Confirm browser diagnostics and visible compatibility summaries do not expose
  subscription secrets.

## Acceptance Result

Record each section as `PASS`, `PARTIAL`, or `BLOCKED`, with browser, OS, and
Primary Target. A `PARTIAL` result must name the target-specific limitation. A
`BLOCKED` result must include the visible diagnostic and recovery step.

Node's experimental `node:sqlite` warning is expected for the current Node 22
Runtime Service prerequisite and is not a browser warning.

## Current Boundaries

- Mihomo and sing-box are the only production Targets.
- Local Mode remains independently usable without Runtime Service.
- Browser CORS, unsupported protocols, external rule resources, and target
  capability differences remain explicit limitations.
- There is no third Target, cloud sync, multi-user account system, public
  backend, plugin marketplace, or AI configuration generation in RC2.

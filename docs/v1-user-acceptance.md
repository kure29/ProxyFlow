# ProxyFlow V1.0 RC User Acceptance

Candidate: `1.0.0-rc.1`
Status: Draft for user acceptance; not a formal release.

This checklist is written for a normal ProxyFlow user. It verifies the full
workflow without requiring knowledge of Universal IR, compiler internals, or
client-specific configuration syntax.

## Before You Start

- Use a current desktop browser at 1280px or wider.
- Start Local Mode with `npm install` and `npm run dev`.
- Use a fictional fixture or a subscription you are authorized to process.
- Treat runtime snapshots as sensitive local data. They may contain normalized
  credentials and are not encrypted by ProxyFlow.

## Local Mode Workflow

### 1. Input

- Open the app and confirm the canvas and Inspector load without console errors.
- Add a Subscription source.
- Import through URL, Paste Content, or a local file.
- Confirm the source shows detected and Ready counts, without showing passwords,
  UUIDs, full proxy URIs, or full URL query tokens in the node preview.
- Add a second source and confirm each source keeps independent runtime state.

### 2. Processing

- Connect a source to Filter, then use a keyword or region filter.
- Add Rename, Sort, Dedupe, Merge, or Limit when needed.
- Confirm the Inspector explains input count, output count, and excluded items.
- Change a source URL and confirm the old runtime snapshot is invalidated while
  the Project URL remains editable.

### 3. Strategy

- Add a Manual strategy and connect one or more processed candidates.
- Add Auto or Failover and confirm candidate readiness and health-check details
  are visible in the Inspector.
- Treat Load Balance as Advanced and target-specific. Unsupported semantics must
  show a diagnostic instead of silently changing behavior.
- Add a Proxy Chain only when a multi-hop path is intentional; verify hop order.

### 4. Routing

- Add a Routing Rule and choose a basic Service, Domain, CIDR, or Port matcher.
- Assign a Strategy, `DIRECT`, or `REJECT` target.
- Move two rules and confirm the displayed priority and generated order are
  deterministic after export/import.
- Use the Route Inspector with a fictional hostname, IP, port, or service and
  confirm it explains the matched rule, priority, target, and candidate path.

### 5. Inspect

- Open the Inspector for a source, processing block, strategy, and route.
- Confirm explanations identify failures and recovery actions in plain language.
- Switch Chinese and English. Labels and diagnostics change language while user
  names and subscription content remain unchanged.
- Reload the browser and confirm the Project returns without runtime credentials
  entering Project Export.

### 6. Output

- Open Preview and inspect Universal IR only as an optional developer view.
- Generate both Mihomo YAML and sing-box JSON from the same Project.
- Confirm a target-specific unsupported feature blocks or warns explicitly; do
  not accept a silent fallback.
- Export both configurations and verify the expected file type and stable rule
  order.

## Optional Runtime Service

Runtime Service is not required for the Local Mode workflow.

- Build with `npm run runtime:build` on Node 22.5 or newer.
- Start a local service with a token of at least 16 characters and an exact
  browser origin.
- Connect it from the Runtime Service panel and confirm health status.
- Refresh a URL source through the service and confirm browser CORS no longer
  blocks the request.
- Confirm failed refreshes preserve Last Known Good, and valid empty results
  require explicit confirmation.
- Enable a schedule, inspect bounded history, restore one snapshot, and clear
  history. Restore must create a new active snapshot.
- Disconnect the service. Local Mode, the Project, and local LKG remain usable.
- Protect or delete the Runtime SQLite file when it is no longer needed.

## Migration And Privacy

- Import a V0.7 Project Schema 2 file and confirm it opens without a schema bump.
- Import a legacy Project Schema 1 fixture and confirm the recovery notice names
  the migration and does not overwrite the original data.
- Import an unknown schema version and confirm the app fails closed with a
  recovery action instead of silently discarding the project.
- Export a Project after using Local Mode and Runtime Service. Confirm runtime
  snapshots, API tokens, normalized credentials, response bodies, and history
  are absent from the exported JSON.

## Acceptance Result

Record each item as `PASS`, `PARTIAL`, or `BLOCKED`, with the browser, OS, and
target client used. A `PARTIAL` result must identify the target-specific
limitation; a `BLOCKED` result must include the visible diagnostic and recovery
step. Do not treat the Vite initial bundle warning or Node's experimental
`node:sqlite` warning as a functional failure.

## Current Boundaries

- Mihomo and sing-box are the formal output targets.
- Browser CORS, unsupported protocols, external rule resources, and target
  capability differences remain explicit limitations.
- There is no scheduled refresh in Local Mode, no snapshot rollback in browser
  IndexedDB, no public backend, no multi-user account system, and no third target.

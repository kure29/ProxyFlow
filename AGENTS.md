# ProxyFlow Engineering Guide

## Product Direction

ProxyFlow is a Local-first proxy configuration orchestration platform with an
optional Runtime Service. The permanent user workflow is:

```text
Input -> Processing -> Strategy -> Routing -> Inspect -> Output
```

Local Mode must remain independently usable. The Runtime Service is an optional
self-hosted enhancement for browser-limited capabilities and must not introduce
a second Project, parser, IR, validator, or compiler implementation.

## Current Objective

The autonomous integration target is ProxyFlow `1.0.0-rc.1`. Work is integrated
through `autopilot/v1`; milestone branches target that branch. The final RC is a
Draft PR to `main` for user acceptance and must not be merged autonomously.

Read these before changing product behavior:

- `docs/product-direction.md`
- the current milestone scope document
- `docs/current-status.md`

## Product Rules

- Do not add features that do not serve the current milestone's primary goal.
- Prefer adapters and compatible extensions over parallel models or big-bang rewrites.
- Basic concepts are Source, Processing, Strategy, Routing Rule, Inspect, and Output.
- Keep Chain, DNS, Rule Set, ASN, GeoIP, GeoSite, Load Balance, target-specific
  options, Universal IR, and raw diagnostics in Advanced experiences.
- Mihomo and sing-box do not define a least-common-denominator ceiling.
- Mark target-specific capability explicitly.
- Unsupported semantics must fail closed and must never silently degrade.
- Do not expose credentials in diagnostics, logs, diffs, Project export, tests, or CI.
- Fixtures use fictional values, `example.com`, and documentation address ranges.

## Git Boundaries

- Never merge autonomous work into `main`.
- Never create the final `v1.0.0` tag or GitHub Release.
- Never force-push shared history or delete stable remote branches/tags.
- Milestone PRs may be reviewed and merged only into `autopilot/v1`.
- Do not use `git add .`, `git add -A`, or `git add --all`; stage explicit paths.
- Do not amend or rebase commits after they have been pushed.

## Quality Gates

Every coherent slice requires focused tests, full `npm test`, `npm run build`,
`git diff --check`, scope review, and secret review.

Additional gates:

- UI: browser QA, Chinese/English, cold reload without console errors or warnings.
- Project: export/import round-trip, v0.7 compatibility, persistence, undo/redo.
- Compiler: Graph -> IR -> validation -> Mihomo/sing-box output and fail-closed tests.
- Runtime: success, failure, abort, race, stale completion, hydration, corruption,
  isolation, and reload coverage.
- Milestone: full tests three consecutive times, build, diff check, browser QA, CI,
  and representative target binary validation where compiler behavior changed.

## Decision Boundary

Make ordinary implementation, component, testing, dependency, and UX decisions
autonomously using the simplest conservative design consistent with the product
direction. Stop only for a genuine blocker involving unrecoverable project data,
unsafe migration, unresolved serious security risk, contradictory product goals,
an impossible core Mihomo/sing-box workflow, unavoidable paid/closed services,
product repositioning, a required merge/tag/release to `main`, or a required
whole-architecture rewrite without a gradual migration path.

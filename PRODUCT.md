# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ProxyFlow serves people who manage proxy subscriptions and need to turn them
into understandable, client-ready configurations without editing low-level
configuration syntax. Basic users need a guided workflow; advanced users need
topology, target-specific controls, and precise diagnostics without losing the
same underlying Project.

## Product Purpose

ProxyFlow is a Local-first proxy configuration orchestration platform with an
optional self-hosted Runtime Service. It preserves a persistent Project and
guides the user through Input, Processing, Strategy, Routing, Inspect, and
Output. Success means a user can choose a client, understand compatibility,
build a configuration, explain its behavior, and export a valid target config.

## Positioning

ProxyFlow combines a client-aware structured Workspace with an optional Visual
Flow over one Project, one parser pipeline, one Universal IR, one validation
chain, and independent target compilers. It is neither a proxy client nor a
one-shot subscription converter.

## Operating Context

- New Projects use Mihomo as the supported Primary Target.
- The Workspace is the default editing experience across desktop and mobile.
- Visual Flow remains available for topology, advanced editing, and diagnosis.
- Other targets are compatibility and optional export paths, not a lowest-common-
  denominator ceiling for the Primary Target.
- Local Mode must remain usable without an account or Runtime Service.

## Capabilities and Constraints

- The canonical workflow is Input -> Processing -> Strategy -> Routing ->
  Inspect -> Output.
- Primary Target controls default authoring choices while target switching is
  non-destructive.
- Source endpoints are preserved even when the current target cannot compile
  them.
- Capability declarations must agree with validation and compiler behavior.
- Unsupported semantics fail closed and are never silently dropped or changed.
- Project, parser, processing, routing, validation, IR, and compiler engines are
  shared by Workspace and Visual Flow.
- Mihomo is the only production target in 1.0. sing-box official export is
  paused while its compiler, capability, validator, parser, tests, and existing
  Project data remain intact. Surge and Loon are planned architecture cases,
  not implemented compilers.
- Project export must not contain runtime credentials or cached subscription
  credentials.

## Brand Commitments

- Product name: ProxyFlow.
- Product terms: Primary Target, Target Compatibility, Workspace, Visual Flow,
  Strategy, Routing, Inspect, Export, Advanced, and Target-native.
- The incumbent quiet, utilitarian visual system remains the design authority
  for 1.0. Client-first changes information architecture, not brand identity.

## Evidence on Hand

- Accepted product direction: `docs/product-direction.md`.
- Current implementation and validation status: `docs/current-status.md`.
- V1.0 remains within the approved Client-first acceptance scope.
- Existing fictional fixtures and representative Mihomo/sing-box binary
  validation are the only capability proof; no unsupported marketing claims are
  permitted.

## Product Principles

- Client-first authoring, without destructive client lock-in.
- Capability-driven UI and fail-closed output.
- One persistent Project with multiple accurate views.
- Basic workflows first; advanced topology and target-native controls remain
  available without increasing ordinary-user learning cost.
- Local-first operation with an optional, bounded Runtime Service.

## Accessibility & Inclusion

Workspace navigation, forms, ordered routing controls, compatibility states,
and target switching must support keyboard use, visible focus, semantic labels,
screen readers, and touch-sized controls. Mobile users must not depend on
precise canvas dragging or edge creation for the ordinary workflow.

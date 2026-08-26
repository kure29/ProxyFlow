# ProxyFlow Product Direction

Status: ProxyFlow 1.2

This document defines the product boundary used by maintainers, contributors, and future development tasks. It is the default decision record when a proposed feature conflicts with the current product direction.

## Product Positioning

> ProxyFlow 是一个 Local-first、可选 Runtime Service 的代理配置编排平台。它将订阅输入、节点处理、策略、分流、检查和多目标配置编译，组织成一个可解释、可导出的项目工作流。

ProxyFlow is not a proxy client. It does not provide TUN, inbound listeners, system proxy integration, VPN connectivity, or real-time traffic forwarding.

ProxyFlow is also not a one-shot subscription converter. Its core is a persistent Project, a client-aware structured Workspace, an optional Visual Flow, shared semantic validation, and independent target compilers.

ProxyFlow serves people who need to turn proxy subscriptions into
understandable, client-ready configurations without editing low-level syntax.
The ordinary workflow stays guided, while advanced users retain topology,
target-specific controls, and precise diagnostics over the same Project.

## Core User Workflow

Every user-facing capability must belong to one of these stages:

```text
输入
→ 处理
→ 策略
→ 分流
→ 检查
→ 导出
```

- Input: Subscription URL, pasted content, or local file.
- Processing: Filter, Rename, Sort, Dedupe, Merge, and Limit.
- Strategy: Manual, Auto, and Failover in the basic workflow.
- Routing: Decide which traffic uses a Strategy, DIRECT, or REJECT.
- Inspect: Explain matches, exclusions, candidates, and export blockers.
- Output: Compile and export a Mihomo, Surge, or Loon configuration.

Subscription lifecycle management supports this workflow, but it is not the product's sole purpose. Target compilation is a core capability, but compiler terminology should not become the primary user interface.

## Client-first Product Model

New Projects use **Mihomo** as the default supported Primary Target. The
Primary Target drives default authoring choices, compatibility guidance, and
the default export. It does not delete source endpoints, graph nodes, or
target-native settings that another Target cannot currently express.

Capability declarations are shared product contracts, not display metadata.
Workspace creation controls, compatibility summaries, validation, and compiler
behavior must agree. Unsupported semantics remain visible and fail closed.

The product surface evaluates the active supported Primary Target instead of a
least-common-denominator intersection. Cross-target capability, validation,
and compiler registries remain intact for future targets and internal
regression coverage.

Current target status:

- Mihomo: Supported production Export Target and the default for new Projects.
- Surge: Supported production Export Target within its documented fail-closed
  capability subset.
- Loon: Supported production Export Target within its evidence-bounded,
  fail-closed capability subset.
- sing-box: Official export paused. Its parser, compiler, capability, validator,
  tests, and Universal IR infrastructure remain available for regression and
  possible future use. Historical Projects load without data loss, can switch
  to a supported target, and retain their target-specific data.
- Shadowrocket: Supported product Export Target for the exact evidence-bounded
  subset pinned to Shadowrocket 2.2.65 build 2615. The adapter does not claim
  universal native Shadowrocket capability: mixed IP/GEO precedence,
  unverified IPv6 behavior, encrypted/richer DNS roles, Service Rules, native
  remote sources, and other unproven protocol variants remain conditional or
  fail closed as documented in [`shadowrocket-rc-readiness.md`](shadowrocket-rc-readiness.md).
  Stash and Quantumult X remain planned.

Subscription Request Profile is independent from Export Target. Auto, Mihomo,
sing-box, and Generic request profiles remain available.

## Hybrid Workspace

Workspace is the default product surface. Visual Flow is a secondary view for
topology, complex Processing, Chain, and advanced graph editing. Both operate
on the same Project and Graph; neither owns hidden semantic state.

```text
Persistent Project
      ├── Workspace
      └── Visual Flow
```

Core intent continues to represent shared endpoint, processing, strategy, and
routing semantics. Target-native extensions remain namespaced and inactive
when another Primary Target is selected. Adding a future Target must extend the
capability profile and compiler without replacing the Project or shared core.

## Product Surface

The Hybrid Workspace is a product-surface contract, not a separate application
architecture. Workspace remains the default and uses the following compact
Project navigation:

```text
Sources -> Proxies -> Processing -> Strategies -> Routing
        -> DNS / Advanced -> Inspect -> Export
```

Visual Flow remains available for topology, connection editing, Chain, and
advanced debugging. Workspace edits, Visual Flow edits, persistence,
undo/redo, validation, and compilation must continue through the same Project
and Graph.

The surface follows a Calm Blue and neutral semantic design system. Blue is for
brand, interaction, focus, and selection; green, orange, and red are reserved
for success, warning, and error/destructive status. Module categories must not
create a competing rainbow color system. Product icons use one stroke style,
while third-party artwork is used only when its source is verified.

Desktop may place a non-modal inspector beside the current page. Tablet may use
an overlay inspector. Mobile is a single-column Workspace with a compact
section selector and full-screen editors. The complete basic workflow must
remain possible without precise canvas interaction.

## Accessibility And Inclusion

Workspace navigation, forms, ordered routing controls, compatibility states,
and target switching must support keyboard use, visible focus, semantic labels,
screen readers, and touch-sized controls. Mobile users must not depend on
precise canvas dragging or edge creation for the ordinary workflow.

## Local Mode

Local Mode is permanent and must remain independently usable.

Even after a Runtime Service exists, a user must be able to:

- use ProxyFlow without an account;
- use ProxyFlow without connecting to a server;
- open and edit a Project in the browser;
- compile and export Mihomo, Surge, and Loon configurations;
- use the local IndexedDB runtime cache;
- retain local Project access when a Runtime Service is unavailable.

A backend must never be required to open a Project or run the Project, validation, IR, and compiler pipeline.

## Runtime Service

The preferred product name is **Runtime Service**. Product copy should not prematurely describe it as Cloud, SaaS, or a Connected Account.

The Runtime Service is an optional connected runtime for capabilities that browsers cannot perform reliably:

- Subscription Fetch Gateway;
- Scheduled Refresh;
- limited Snapshot History.

The first Runtime Service version is self-hosted and single-user. It does not include multi-tenancy, teams, billing, email accounts, SaaS hosting, or a plugin marketplace.

Project, Universal IR, validation, parsing, and target compiler behavior must remain shared. A Runtime Service must not introduce a second semantic implementation.

## Basic And Advanced

The Basic workflow exposes only:

- Source;
- Processing;
- Strategy;
- Routing Rule;
- Inspect;
- Output.

Advanced contains:

- Chain;
- DNS;
- Rule Set;
- ASN;
- GeoIP;
- GeoSite;
- Load Balance;
- target-specific options;
- Universal IR Developer Preview;
- raw diagnostics.

Advanced does not mean that these capabilities are removed. It means they must not increase the learning cost of the ordinary workflow.

## Product Concept Rules

- Reuse an existing concept when it can express the user problem.
- An internal IR type is not automatically a user-visible feature.
- A UI control without reliable compiler behavior must not be described as Supported.
- Capability available in only one target must be explicitly marked target-specific.
- Unsupported semantics must fail closed instead of being omitted or approximated silently.
- Each release has one primary product goal.
- Service Rule and Custom Rule are matcher forms of one Routing Rule, not separate rule systems.
- Rule Group is a UI container only. It may group, fold, order, or enable rules, but it owns no matcher, target, or priority semantics.
- Output selects an export target; it is not a routing target.
- Final is presented to users as Default Route or 未匹配流量.
- Routing presents Service Rule and Custom Rule as two authoring paths over one
  rule model. Rule-source repositories and raw matcher details remain Advanced.
- A Project has at most one active DNS owner node. That node may hold multiple
  resolver profiles; target-specific resolver roles must use capability-driven
  controls and fail closed when unsupported.
- Mihomo, Surge, Loon, and the evidence-bounded Shadowrocket adapter are
  production Export targets. sing-box is paused but retained below the product
  surface. Planned targets must not appear as ready or actionable before a real
  compiler path and acceptance evidence exist.
- Project export must not contain Runtime credentials or cached subscription
  credentials.
- Supported product claims require capability, validation, and compiler
  evidence; unsupported marketing claims are not permitted.

## Feature Admission Gate

Before implementation, every feature must answer:

1. Which real user problem does it solve?
2. Does it belong to Input, Processing, Strategy, Routing, Inspect, or Output?
3. Does it add a concept users must learn?
4. Can the existing product and data model express it?
5. How does it work in Local Mode?
6. Is a Runtime Service genuinely required?
7. Can the current supported Target express it?
8. Which paused or planned Target boundaries must remain intact?
9. How does every unsupported path fail closed?
10. Is there an end-to-end Graph -> IR -> Validator -> Compiler -> Output test?
11. What are its long-term test and maintenance costs?
12. Does it fit the release's single primary goal?

A feature cannot enter implementation when it:

- has UI but no compiler path;
- is supported by one target but presented as cross-target;
- has no user acceptance flow;
- duplicates an existing concept;
- cannot define fail-closed behavior;
- exists only because a target client exposes a field;
- introduces a second primary goal into the current release.

## 1.0 Scope

ProxyFlow 1.0 provides a stable, client-first, explainable, migratable, and
verifiable workflow from a real subscription to Mihomo output. The Workspace
and Visual Flow remain two views over the same Project model.

The following remain outside the 1.0 product scope:

- a third production output target;
- full Mihomo schema replication;
- full sing-box schema replication;
- conversion between every client format;
- a public CORS proxy;
- arbitrary JavaScript execution;
- a plugin marketplace;
- AI-generated configuration;
- multi-user collaboration and billing;
- a mobile application;
- a large-scale node speed-test platform;
- continued protocol expansion without first improving the existing workflow and explanations.

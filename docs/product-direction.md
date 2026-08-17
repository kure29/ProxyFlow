# ProxyFlow Product Direction

Status: Accepted Product Direction

This document defines the product boundary used by maintainers, contributors, and future development tasks. It is the default decision record when a proposed feature conflicts with the current product direction.

## Product Positioning

> ProxyFlow 是一个 Local-first、可选 Runtime Service 的代理配置编排平台。它将订阅输入、节点处理、策略、分流、检查和多目标配置编译，组织成一个可解释、可导出的项目工作流。

ProxyFlow is not a proxy client. It does not provide TUN, inbound listeners, system proxy integration, VPN connectivity, or real-time traffic forwarding.

ProxyFlow is also not a one-shot subscription converter. Its core is a persistent Project, a visual workflow, a target-neutral Universal IR, semantic validation, and independent target compilers.

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
- Output: Compile and export Mihomo or sing-box configuration.

Subscription lifecycle management supports this workflow, but it is not the product's sole purpose. Target compilation is a core capability, but compiler terminology should not become the primary user interface.

## Local Mode

Local Mode is permanent and must remain independently usable.

Even after a Runtime Service exists, a user must be able to:

- use ProxyFlow without an account;
- use ProxyFlow without connecting to a server;
- open and edit a Project in the browser;
- compile and export Mihomo and sing-box configurations;
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

## Feature Admission Gate

Before implementation, every feature must answer:

1. Which real user problem does it solve?
2. Does it belong to Input, Processing, Strategy, Routing, Inspect, or Output?
3. Does it add a concept users must learn?
4. Can the existing product and data model express it?
5. How does it work in Local Mode?
6. Is a Runtime Service genuinely required?
7. Can Mihomo express it?
8. Can sing-box express it?
9. How does each unsupported path fail closed?
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

## Version Direction

### V0.8 - Strategy & Routing Core

Enable an ordinary user to complete subscription input, processing, strategy selection, basic routing, compatibility checks, and dual-target export.

### V0.9 - Explain & Simplify

Explain why traffic matches a rule, why a node is excluded, why export is blocked, and where traffic ultimately goes. Simplify the Basic and Advanced experience.

### V0.10 - Runtime Service MVP

Introduce an optional, self-hosted Runtime Service for a controlled Subscription Fetch Gateway, Scheduled Refresh, and limited Snapshot History. This is not a cloud platform.

### V1.0 - Stable Workflow

Deliver a stable, explainable, migratable, and verifiable workflow from a real subscription to Mihomo or sing-box output.

### V1.x - Selective Expansion

Consider only capabilities justified by real demand, such as Project Sync, Config Publish URL, Secret Vault, Rule Set cache, notifications, a third target, or a desktop application. This list is not a commitment to implement every item.

## Deferred Before V1.0

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

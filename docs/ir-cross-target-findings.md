# Universal IR Cross-target Findings — V0.4

V0.4 is the first time one ProxyFlow IR has been lowered by two structurally different clients. The result is deliberately mixed: shared semantics compile in both targets, while genuine capability gaps remain explicit.

## What worked unchanged

- Graph is compiled exactly once. Both target compilers receive the same `ProxyFlowIR` object.
- Strategy intent—Fixed, Select, Auto Select, Fallback, Load Balance, Chain—remains target-neutral even when a target cannot implement one of them.
- Route ordering, Service references, Domain/Suffix/Keyword/CIDR matchers, DIRECT, REJECT, Final, DNS resolver intent, and Chain hop order required no target branches in Core.
- The existing reference model (`SourceId`, `TransformId`, `StrategyId`) and semantic cycle detection remained valid.
- Project Schema and IR version remain at V2 because additions are optional and backward compatible.

## What required a Universal IR extension

### Resolved proxy endpoints

`ManualProxySourceIR` previously contained placeholders. V0.4 adds a minimal `ProxyEndpointIR` union for HTTP and SOCKS5 with ID, name, server, port, and optional credentials.

This is not a sing-box field set. A concrete upstream proxy is a real, client-neutral entity, and both Mihomo and sing-box now compile it. Target runtime fields such as `tag`, `detour`, `domain_resolver`, and `dialer-proxy` remain outside IR.

### Portable inline matchers

Services can optionally carry concrete Domain, Suffix, Keyword, IPv4/IPv6 CIDR, and Port matchers. This lets either compiler lower a Service without treating a target-specific remote rules file as universal.

### Rule resource formats

`RuleSource.format` now distinguishes `sing-box-source` and `sing-box-binary` from Clash YAML, text, MRS, multi-client, and universal metadata. This describes the resource, not a hard-coded target URL.

### Port matcher

Port is a shared traffic property and is now represented by `PortMatcherIR`. Mihomo lowers it to `DST-PORT`; sing-box lowers it to `port`.

## What stayed target-specific

| Concern | Mihomo | sing-box |
| --- | --- | --- |
| Runtime name | proxy/group/provider name | outbound/rule-set tag |
| Remote proxy source | proxy-provider | no equivalent used |
| Chain | provider clone + `dialer-proxy` | dial-capable outbound clone + `detour` |
| DNS output | `redir-host` and nameserver list | typed DNS servers and domain resolver |
| Rules | comma-delimited rule strings | structured Route Rule + Action |
| User selection | native group behavior | selector; switching depends on Clash API |

No `if (target === ...)` branches were added to Graph Compiler, IR, semantic validation, Canvas, or Routing UI.

## What could not be represented faithfully

- Unresolved Subscription / Provider sources: Mihomo can preserve these as proxy-providers; sing-box compilation needs materialized outbounds.
- Fallback: sing-box URLTest chooses fastest and is not ordered failover.
- Load Balance: selector and URLTest are not load-balancing substitutes.
- Clash YAML rule providers: their URL cannot be relabeled as sing-box source format.
- ASN, legacy GeoIP, and legacy GeoSite: no silent conversion is attempted without an explicit compatible rule resource.
- Runtime inbound intent: the current Universal IR does not say whether the user wants TUN, Mixed, HTTP, or SOCKS ingress.

## What V0.5 should solve

The blocking cross-target gap is now materialization, not another target compiler. V0.5 should introduce a normalized proxy protocol model and subscription/import parsing pipeline that produces validated `ProxyEndpointIR` records before target compilation.

That work should remain separate from compilers: fetch/decode/parse/normalize first, compile pure IR second. Protocol scope should expand only with fixtures and validation for each protocol. Rule conversion and inbound profiles are independent follow-up tracks and should not be bundled into the parser milestone.

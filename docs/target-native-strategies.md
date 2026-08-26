# Target-native Strategy Groups

ProxyFlow keeps the Project graph as the source of truth and derives a
target-neutral Universal IR from it. Universal strategies (`select`,
`auto-select`, `fallback`, `load-balance`, `fixed`, and `chain`) remain the
only strategy kinds in `src/core/ir/strategy.ts`.

## Target-native boundary

Target-native strategy nodes use the generic `target-native-strategy` graph
block. Their `targetNativeStrategy` data is typed and serialisable, and the
graph compiler returns it as `nativeStrategies` alongside (not inside) the
Universal IR. Target adapters opt into that extension explicitly. No raw
Surge config is stored in Project data.

`PolicyReference` is the shared typed policy reference used by native groups:

- `proxy` points to a materialised proxy endpoint;
- `strategy` points to another strategy group;
- `builtin` currently allows only `DIRECT` and `REJECT`.

This shape is intentionally extensible for future target adapters such as a
separately-audited Loon SSID strategy. Loon SSID is not treated as equivalent
to Surge Subnet in this iteration.

## Surge Smart

Smart stores a group name and an ordered list of proxy references. Only real,
materialised proxy endpoints are accepted. Nested groups, `DIRECT`, `REJECT`,
and other built-ins are rejected by both the editor and the Surge
compatibility validator. The adapter lowers the typed group to a Surge
`smart` policy entry and preserves member order deterministically. The optional
`policy-priority` regex/factor list and `evaluate-before-use` boolean are also
typed and emitted in declaration order.

## Surge Subnet

Subnet stores ordered conditions plus a required explicit default policy. The
first matching condition keeps Surge's native precedence semantics. The
initial matcher set is deliberately narrow:

- `SSID:value`
- `BSSID:value`
- `ROUTER:value`
- `TYPE:WIFI`
- `TYPE:WIRED`
- `TYPE:CELLULAR`
- `MCCMNC:digits` (five or six digits: three-digit MCC plus two/three-digit MNC)

Each condition and the default may target a proxy, a strategy group, `DIRECT`,
or `REJECT`. The editor exposes structured fields; the Surge expression is
derived only at compile time.

Conditions are emitted as `matcher = policy` mappings, with `default = policy`
first and the remaining conditions in the user's declared order. The first
matching condition wins in Surge; ProxyFlow does not reorder conditions.

## Surge Smart / Subnet capability audit

The audit below is based on the current Surge documentation:
[`smart`](https://manual.nssurge.com/policy-groups/smart.html),
[`subnet`](https://manual.nssurge.com/policy-groups/subnet.html),
[`common group parameters`](https://manual.nssurge.com/policy-groups/parameters.html),
[`policy including`](https://manual.nssurge.com/policy-groups/policy-including.html),
and the canonical
[`SUBNET expressions`](https://manual.nssurge.com/rules/protocol-and-network.html).

Classification labels are explicit: **SUPPORTED** (including CORE semantics),
**DEFERRED**, **UNIVERSAL OVERLAP**, **PRESENTATION ONLY**,
**DEPRECATED / LEGACY**, and **NOT APPLICABLE**.

### Smart

| Capability | Official status | ProxyFlow status | Classification / decision |
| --- | --- | --- | --- |
| Proxy members only | Supported; nested groups and built-ins are ignored by Surge | Supported and fail-closed | SUPPORTED — CORE; only materialised proxy references are selectable |
| Member limits / empty group | At least one usable member is required for a working group | Supported | SUPPORTED — CORE; empty or duplicate/missing members block export |
| `policy-priority` | Supported; quoted `regex:factor` pairs separated by `;`, first match wins, factor > 0 | Supported | SUPPORTED — CORE; typed rules, regex validation, deterministic output |
| `evaluate-before-use` | Supported; optional boolean, default `false` | Supported | SUPPORTED — CORE; typed optional boolean and Inspector toggle |
| `interval` / `timeout` / `tolerance` | `interval` has no effect on Smart; the other automatic-group knobs are not Smart parameters | Not emitted | DEFERRED / NOT APPLICABLE — avoid implying periodic URL-test semantics |
| `no-alert` | Common parameter, but has no effect on Smart | Not emitted | DEFERRED — no semantic effect for this group |
| `hidden`, `icon-url` | Supported common/presentation parameters | Not emitted | PRESENTATION ONLY — reserved for a target-neutral presentation PR |
| `underlying-proxy` | Supported on Smart, not on Subnet | Not emitted | UNIVERSAL OVERLAP — use Proxy Chain where equivalent; defer when not lossless |
| `policy-path`, `include-all-proxies`, `include-other-group`, regex filtering and source modifiers | Supported through Policy Including | Not emitted | UNIVERSAL OVERLAP — covered by Subscription/Filter/Merge/strategy composition; no duplicate Surge-only fields |
| Temporary manual override | Supported by the client UI | Not persisted | PRESENTATION ONLY — runtime UI state, not Project graph semantics |

### Subnet

| Capability | Official status | ProxyFlow status | Classification / decision |
| --- | --- | --- | --- |
| Required `default` policy | Supported and required | Supported | SUPPORTED — CORE; typed `defaultPolicy` |
| `SSID:value` | Supported; `*` and `?` wildcards | Supported | SUPPORTED — CORE; typed matcher |
| `BSSID:value` | Supported; case-insensitive with wildcards | Supported | SUPPORTED — CORE; typed matcher |
| `ROUTER:ip` | Supported; exact default gateway | Supported | SUPPORTED — CORE; typed matcher |
| `TYPE:WIFI`, `TYPE:WIRED`, `TYPE:CELLULAR` | Supported (case-insensitive keyword) | Supported | SUPPORTED — CORE; typed enum |
| `MCCMNC:digits` | Supported on cellular only; MCC+MNC digit string | Supported | SUPPORTED — CORE; strict five/six-digit validation |
| Bare matcher value | Supported for old profiles | Not generated | DEPRECATED / LEGACY — modern prefixed syntax is the source of truth |
| `cellular` parameter | Supported only for compatibility, deprecated in favor of `TYPE:CELLULAR` | Not generated | DEPRECATED / LEGACY — avoids two competing precedence models |
| Proxy, strategy group, `DIRECT`, `REJECT` targets | Policy targets are accepted by the group grammar | Supported for these four typed references | CORE — other built-ins remain intentionally out of scope |
| `policy-path`, `include-*`, regex/source parameters, `no-alert`, etc. | Explicitly unavailable on Subnet | Not applicable | NOT APPLICABLE — never shown in the Subnet Inspector |
| `hidden`, `icon-url` | Supported | Not emitted | PRESENTATION ONLY — defer to target-neutral strategy presentation work |
| Temporary manual override | Supported by the client UI | Not persisted | PRESENTATION ONLY — runtime UI state |

The intentionally deferred Surge built-ins (`CELLULAR`, `CELLULAR-ONLY`,
`HYBRID`, `NO-HYBRID`, `REJECT-DROP`, and related variants) are not silently
substituted into either group. They remain a separate target-native built-in
policy task.

## Target switching and safety

Switching a Project away from Surge preserves native nodes and their intent.
The selected target receives `TARGET_NATIVE_STRATEGY_UNSUPPORTED`, explains
that no proven equivalent exists, and blocks Preview/Export. No automatic
conversion to URL Test, Select, DIRECT, or a flattened graph is performed.
Non-Surge compilers also reject an explicitly supplied Surge-native extension
fail-closed.

## Reference scenario

The deterministic fixture `surgeNativeAcceptanceProject` models:

```text
Hong Kong Smart (Smart · SURGE)
  HK-01, HK-02, HK-03

Hong Kong (Subnet · SURGE)
  SSID:Home-WiFi → DIRECT
  TYPE:CELLULAR → Hong Kong Smart
  default → Hong Kong Smart
```

The fixture uses synthetic endpoints only. A real SSID and private proxy
credentials must be supplied by a human during real-client acceptance and are
never committed.

## Deferred presentation work

Strategy-group icon URLs, service icon mapping, and target-specific background
cards are intentionally deferred. The typed native model leaves room for
optional presentation metadata later without coupling icons to strategy
semantics.

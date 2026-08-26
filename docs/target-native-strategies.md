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
`smart` policy entry and preserves member order deterministically.

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

Each condition and the default may target a proxy, a strategy group, `DIRECT`,
or `REJECT`. The editor exposes structured fields; the Surge expression is
derived only at compile time.

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

# ProxyFlow Core Architecture

## Source of truth

ProxyFlow 使用单向派生架构，并在 Project 与 IR 之间加入可丢弃的运行时订阅快照：

```text
Visual Graph / ProxyFlow Project + Runtime Subscription Snapshots
              │
              │ compileGraph(project)
              ▼
       Universal Proxy IR
              │
              │ validateIR(ir)
              ▼
       Semantic Issues / Valid IR
              │
              │ ConfigCompiler.compile(ir)
              ▼
        Target-specific configuration
          ↙             ↓             ↘             ↘
    Mihomo YAML     Surge CONF     Loon CONF     Shadowrocket CONF
```

URL Subscription 会同时保留两种互补事实：

```text
Remote source identity + Current materialized snapshot
                    │
                    ▼
       ProxySetRef / Transform source lineage
                    │
                    ▼
       Remote Source Lowering Planner
            │ target capability
            ├──────── native remote adapter
            └──────── materialized ProxySet
```

`RemoteProxySourceIR` 是 Universal IR 的 additive、target-neutral metadata；其中没有 `proxy-providers`、`use` 或任何客户端语法。`analyzeProxySetLineage()` 沿 `ProxySetRef` 追踪稳定 Source ID 与 Transform operation，`planRemoteProxySource()` 按每个 consumer path 生成唯一决策。Target compiler 不从 endpoint 的显示 `sourceName` 反推 lineage。

- Graph / Project 是编辑器和持久化的唯一事实来源。
- Paste 原文属于 Project 输入；Local File 原文、Fetch response、ParseResult 与 ProxySet cache 都是运行时数据，不写入 Project。
- IR 是按需生成的只读派生物，不保存到 `ProjectStorage`。
- IR 不依赖 React、Zustand、DOM、Canvas 或 `@xyflow/react`。
- Target Compiler 只接收 IR，不能读取 React Flow Graph。
- Mihomo、Surge、Loon 与证据边界约束的 Shadowrocket 是正式 Compiler 产品路径。sing-box Compiler 继续通过异步
  loader 保留，用于历史 Project 与内部回归，但不作为正式 Export Target。

Project Schema Version 与 IR Schema Version 是两个独立版本：

- `PROJECT_SCHEMA_VERSION = 2`
- `PROXYFLOW_IR_VERSION = 2`

## Universal IR entities

所有核心实体使用 discriminated union：

- `SourceIR`: subscription（可同时包含 remote descriptor 与 snapshot endpoints）、manual-proxy（可含基础与现代显式标准 endpoint）、legacy provider、imported-config
- `TransformIR`: filter、rename、sort、deduplicate、merge、limit
- `StrategyIR`: fixed、select、auto-select、fallback、load-balance、chain
- `TrafficMatcherIR`: service、domain、domain-suffix、domain-keyword、IP CIDR、port、ASN、GeoIP、GeoSite、rule-set
- `RouteTargetIR`: strategy、direct、reject
- `DnsIR`: automatic 或 custom resolver
- `OutputIR`: 用户请求的目标客户端
- `ServiceIR`: 客户端无关的 Service 与 Remote Rule Source metadata

Output 不参与流量路由语义。它只描述用户希望生成什么目标配置。

## Reference model

IR 只保存有类型引用，不内嵌上游实体：

```ts
type ProxySetRef =
  | { kind: 'source'; id: SourceId }
  | { kind: 'transform'; id: TransformId }

type StrategyCandidateRef =
  | ProxySetRef
  | { kind: 'strategy'; id: StrategyId }
```

例如：

```text
HKT Subscription → HK Filter → HK Auto
OpenAI → HK Auto
```

生成的核心语义是：

```json
{
  "sources": [
    { "kind": "subscription", "id": "hkt", "name": "HKT", "enabled": true }
  ],
  "transforms": [
    {
      "kind": "filter",
      "id": "hk-filter",
      "name": "HK Filter",
      "input": { "kind": "source", "id": "hkt" },
      "include": ["HK"],
      "exclude": []
    }
  ],
  "strategies": [
    {
      "kind": "auto-select",
      "id": "hk-auto",
      "name": "HK Auto",
      "source": { "kind": "transform", "id": "hk-filter" }
    }
  ],
  "routes": [
    {
      "id": "openai",
      "name": "OpenAI",
      "matcher": { "kind": "service", "serviceIds": ["openai"] },
      "target": { "kind": "strategy", "id": "hk-auto" },
      "priority": 10
    }
  ]
}
```

## Graph compilation

`compileGraph()` 构建 `nodesById`、`incomingEdges`、`outgoingEdges` 和 service lookup，随后分阶段编译：

1. Graph structure validation
2. Sources
3. Transforms
4. Strategies
5. Routes and Final
6. DNS and Outputs
7. IR semantic validation

Graph Compiler 不依赖 Canvas position。缺少显式 route priority 时，使用稳定的 Graph node insertion order，确保相同输入始终得到相同输出。

### DNS ownership boundary

An enabled `dns` graph node is the single effective DNS semantic owner. The
compiler exposes its `effectiveDnsNodeId` independently from Universal DNS IR.
The owner’s Project-layer `universalDnsMode` is one of `none`, `automatic`, or
`custom`; `none` intentionally compiles to no `DnsIR`, while the owner identity
remains available for future target-native DNS semantics. Missing legacy mode is
normalized (or inferred at the direct compiler boundary) to `custom` when an
enabled resolver exists, otherwise `automatic`. Multiple enabled DNS nodes fail
closed with `DNS_MULTIPLE`, and disabled nodes are runtime-inert but retained.

Target-native DNS behavior is namespaced and capability-driven. The effective
enabled DNS node remains the sole DNS owner and exposes its compiler-owned
`effectiveDnsNodeId` independently from Universal DNS IR. The current Surge
target implements the typed `targetNativeSurgeDnsBehavior` subset for
`always-real-ip`; the behavior is lowered only by the Surge compiler and never
enters Universal `DnsIR`.

`universalDnsMode = none` plus a DNS-node-owned `always-real-ip` record is a
valid combination: no Universal `DnsIR` is produced, while the DNS owner and
its target-native behavior remain available. This does not imply that every
target-native DNS feature is implemented.

## Proxy Chain

`hopIds` 是 Chain 顺序的唯一语义来源：

```ts
hops: [
  { kind: 'strategy', id: 'hk-auto' },
  { kind: 'strategy', id: 'us-auto' }
]
```

数组顺序表示：

```text
Client → HK Auto → US Auto → Internet
```

Visual strategy edges 只负责显示。Edge 与 `hopIds` 不一致时产生 `CHAIN_EDGE_MISMATCH` warning。DFS recursion stack 用于检测自引用和 A → B → C → A 等 Chain cycle。

## Validation layers

Graph validation 负责：

- duplicate node id
- broken edge
- self connection
- missing edge semantic
- data-flow cycle

Graph compilation 负责把不完整的 UI 数据转换为稳定 issue：

- transform / strategy missing input
- route / final missing target
- unknown service
- chain edge mismatch
- output target missing

IR validation 可脱离 UI 单独执行，负责：

- typed reference existence
- merge input count
- strategy candidate requirements
- Chain empty / single hop / missing reference / self reference / cycle
- route target existence
- Final and Output presence
- DNS resolver semantics

Issue 使用稳定 `code`，UI、CLI、测试和未来本地化不依赖错误文本。

## Subscription materialization

`compileGraph(project, { subscriptionSnapshots })` 将当前会话已经解析的节点注入 Subscription Source IR。随后 `materializeProxySet()` 以纯函数方式解析 `ProxySetRef`，对 Source / Transform 结果按 context 缓存，并传播上游 issue。

Partial variant 仍留在 Parser result 与 Import Summary 中，并随解析结果进入 target-neutral materialized ProxySet。各 Target 的兼容性检查再决定是否以 warning 保留、在可替换候选中跳过，或对不可表达的显式 intent 失败闭合；UI 继续解释 detected 与 usable 的差异。

Target Compiler 不访问网络、Store 或 Parser。URL Source 即使选择 remote export，也必须先拥有当前解析 snapshot；该 snapshot 继续用于预览、兼容性分析、处理和不支持 remote target 的回退。

URL Subscription 的 `exportMode` 是客户端无关的用户意图：

- `auto`: capability、request profile 与当前 consumer lineage 都可无损 lowering 时使用 native remote，否则 materialize。
- `remote`: 必须使用 native remote；不支持时返回 semantic error，禁止静默 materialize。
- `materialized`: 始终导出当前 snapshot。

Planner 的决策是 per ProxySet / per consumer path。同一 Source 的直接分支可以 native remote，而经过 Filter 的另一分支仍 materialize；同一 target 输出中两者可以并存。第一阶段只有未经过 Transform 的 URL Source 可走 native path；Filter、Rename、Sort、Dedupe、Merge、Limit、manual merge、Fixed identity 与 Proxy Chain hop 都保守 materialize。

Mihomo capability + adapter 首先实现 HTTP proxy-provider lowering。同一 Source ID 的多个 consumer 复用稳定、与显示名称无关的 provider key。Surge、Loon、Shadowrocket 与 sing-box 当前未声明 native remote capability，因此 `auto` / `materialized` 分别生成 materialized policies 或 explicit outbounds，`remote` 失败闭合。Quantumult X 或 Stash 只需声明经过验证的 capability 并实现 target adapter，不需要修改 Subscription Parser、ProxySet lineage 或 Graph semantics；Shadowrocket 已通过同一 registry 暴露其证据边界适配器。

为避免旧 Project 输出静默改变，缺少 `exportMode` 的持久化 URL Source 在 V2 additive migration 中规范为 `materialized`；新建 URL Source 默认 `auto`。Project Schema 与 IR major version 均保持 V2。

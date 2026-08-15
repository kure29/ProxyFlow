# ProxyFlow Core Architecture

## Source of truth

ProxyFlow V0.2 使用单向派生架构：

```text
Visual Graph / ProxyFlow Project
              │
              │ compileGraph(project)
              ▼
       Universal Proxy IR
              │
              │ validateIR(ir)
              ▼
       Semantic Issues / Valid IR
              │
              │ future ConfigCompiler.compile(ir)
              ▼
     Target-specific configuration
```

- Graph / Project 是编辑器和持久化的唯一事实来源。
- IR 是按需生成的只读派生物，不保存到 `ProjectStorage`。
- IR 不依赖 React、Zustand、DOM、Canvas 或 `@xyflow/react`。
- Target Compiler 只接收 IR，不能读取 React Flow Graph。
- V0.2 没有真实 Target Compiler。

Project Schema Version 与 IR Schema Version 是两个独立版本：

- `PROJECT_SCHEMA_VERSION = 1`
- `PROXYFLOW_IR_VERSION = 1`

## Universal IR entities

所有核心实体使用 discriminated union：

- `SourceIR`: subscription、manual-proxy、provider、imported-config
- `TransformIR`: filter、rename、sort、deduplicate、merge、limit
- `StrategyIR`: fixed、select、auto-select、fallback、load-balance、chain
- `TrafficMatcherIR`: service、domain、domain-suffix、domain-keyword、IP CIDR、ASN、GeoIP、GeoSite、rule-set
- `RouteTargetIR`: strategy、direct、reject
- `DnsIR`: automatic 或 custom resolver
- `OutputIR`: 用户请求的目标客户端

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

## Non-goals for V0.2

- Mihomo / sing-box / Surge compiler
- VMess、VLESS、Trojan 等 protocol model
- subscription fetching or parsing
- remote rule fetching
- backend or cloud persistence

# ProxyFlow Core Architecture

## Source of truth

ProxyFlow V0.6 继续使用单向派生架构，并在 Project 与 IR 之间加入可丢弃的运行时订阅快照：

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
          ↙           ↘
    Mihomo YAML    sing-box JSON
```

- Graph / Project 是编辑器和持久化的唯一事实来源。
- Paste 原文属于 Project 输入；Local File 原文、Fetch response、ParseResult 与 ProxySet cache 都是运行时数据，不写入 Project。
- IR 是按需生成的只读派生物，不保存到 `ProjectStorage`。
- IR 不依赖 React、Zustand、DOM、Canvas 或 `@xyflow/react`。
- Target Compiler 只接收 IR，不能读取 React Flow Graph。
- Mihomo 与 sing-box Compiler 通过异步 loader 注册，只有当前 Preview / Output 目标会被加载。

Project Schema Version 与 IR Schema Version 是两个独立版本：

- `PROJECT_SCHEMA_VERSION = 2`
- `PROXYFLOW_IR_VERSION = 2`

## Universal IR entities

所有核心实体使用 discriminated union：

- `SourceIR`: subscription、manual-proxy（可含基础与现代显式标准 endpoint）、provider、imported-config
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

Partial variant 仍留在 Parser result 与 Import Summary 中，但在 Source materialization 时以 `PROXY_VARIANT_EXCLUDED` warning 排除。这样 Strategy candidate count 与 Target 输出都只包含可安全生成的节点，同时 UI 仍能解释 detected 与 usable 的差异。

Target Compiler 不读取 URL、不访问 Store，也不再次解析订阅。未处理的安全 HTTP(S) URL 只有 Mihomo 可以保留 remote provider 语义；sing-box 必须得到 materialized endpoint。

## Non-goals for V0.6

- 完整 Mihomo / sing-box Schema 与第三个 Target compiler
- 除 Vision 外的复杂 XTLS flow、Hysteria v1 与未建模协议变体
- node latency measurement or scheduled refresh
- remote rule fetching or conversion
- runtime inbound profiles
- backend or cloud persistence

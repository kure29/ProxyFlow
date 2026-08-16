# Subscription Parser and Proxy Processing

ProxyFlow V0.5 在浏览器中读取订阅内容，将节点规范化为客户端无关的代理模型，再对真实节点集合执行处理并生成目标配置。Parser、ProxySet 处理和 Target Compiler 相互独立；Compiler 不负责下载或猜测订阅内容。

## Supported Input Formats

格式识别以内容为主、文件名为辅：

| Input | Status | Notes |
| --- | --- | --- |
| 每行一个分享链接 | Supported | 支持混合协议、空行与注释 |
| Base64 分享链接列表 | Supported | 解码后再次按内容识别 |
| Clash / Mihomo YAML | Supported | 只读取顶层 `proxies`，忽略策略组、规则等非节点内容并返回 info |
| Paste Content | Supported | 原文随 Project 保存，重开后可重新解析 |
| Local `.txt` / `.yaml` / `.yml` | Supported | 只在当前浏览器会话读取；Project 只保存文件名 |
| URL | Browser-dependent | 浏览器直接请求，不经过 ProxyFlow 后端或 CORS 代理 |

默认拒绝超过 2 MiB 的输入和超过 5,000 个候选节点的订阅。HTTP 状态、声明长度、流式读取长度和请求超时分别检查。

## Supported Protocols

下表表示 V0.5 的基础字段与常见 TLS / WS / HTTP / gRPC transport 映射，不表示支持协议的所有扩展组合。

| Protocol | Parser | Mihomo | sing-box |
| --- | --- | --- | --- |
| HTTP / HTTPS proxy | Supported | Supported | Supported |
| SOCKS5 | Supported | Supported | Supported |
| Shadowsocks | Supported | Supported | Supported |
| Trojan | Supported | Supported | Supported |
| VMess | Supported | Supported | Supported |
| VLESS | Supported | Supported | Supported |

HTTP、SOCKS5 支持基础认证；Shadowsocks 支持 method、password 与可识别的 plugin metadata；Trojan、VMess、VLESS 支持基础 TLS、SNI 和 transport intent。所有端口必须在 1–65535，VMess/VLESS UUID 会验证格式。

## Partially Supported Variants

Reality、Vision、复杂 XTLS flow、特殊 transport 和未识别查询参数不会被猜测。Parser 将此类节点标记为 `Partial`，保留节点名称、协议和问题原因；Import Summary 仍计入 detected / warnings，Node Preview 也继续展示它们。

Partial 节点不会进入可用 ProxySet。处理器返回 `PROXY_VARIANT_EXCLUDED`，目标兼容性检查返回带目标前缀的 warning，其余 ready 节点仍可正常编译。如果集合里只有 Partial 节点，消费它的 Strategy 会因没有可安全生成的成员而失败闭合。

## Unsupported Protocols

Hysteria / Hysteria2、TUIC、WireGuard、Snell、SSH、AnyTLS 等未进入 V0.5 的协议模型。未知 scheme、损坏链接和无法识别的行会作为 `Unsupported` 节点与稳定 issue code 出现在预览中，而不是静默删除。

## CORS Limitations

ProxyFlow V0.5 是纯前端应用。URL Refresh 使用浏览器原生 `fetch`：

- 订阅服务器允许跨域时，可以直接刷新。
- CORS 或网络失败显示为 `CORS blocked`，不会误报为 Parser Error。
- 用户可以改用 Paste Content 或 Import File。
- 刷新失败不会清空上次成功结果；UI 同时显示 Last successful 和 Latest attempt，并将旧结果标记为 stale。

V0.5 不包含后端、Worker、浏览器扩展或公共 CORS proxy。

## Security Model

- Node Preview 只显示名称、协议、地区、掩码后的服务器、端口和解析状态，不显示 password、UUID、token 或完整分享链接。
- UI issue 和 fetch error 不拼接订阅 URL 或认证信息；订阅 URL 展示场景可使用 query redaction。
- 节点 ID 与 identity fingerprint 是稳定、不可读的 opaque hash，不包含原始 secret。
- Paste Content 是可恢复的用户项目输入，因此会随本地 Project 保存；Local File 原文和所有派生 ParseResult / ProxySet snapshot 都不会保存。
- 生成可运行的 Mihomo / sing-box 配置必然需要写入代理认证字段。Preview 和导出属于用户主动请求的最终配置，不是脱敏诊断视图。
- 所有示例、fixtures 和测试凭据均为虚构值与 `example.com` 域名。

## Node Normalization

Parser 输出真正的 discriminated union：HTTP、SOCKS5、Shadowsocks、Trojan、VMess、VLESS 各自只拥有协议需要的字段。共同字段包括 stable ID、name、server、port 和 metadata；metadata 可以包含 source、region hint 与 compatibility hint。

地区识别优先读取节点名中的国旗 emoji，再匹配常见地区关键词。当前内置 HK、US、JP、SG、TW、KR、UK、DE、FR、CA、AU 与 UNKNOWN，并保留 confidence 和识别来源。地区只是可解释的 hint，不伪装成精确地理定位。

## Transforms

所有处理都在 materialized ProxySet 上真实执行：

| Transform | V0.5 status | Semantics |
| --- | --- | --- |
| Filter | Supported | name contains / regex、region、protocol include / exclude |
| Rename | Supported | regex replacement；无效表达式返回稳定错误 |
| Sort | Supported | name、region、protocol；稳定排序 |
| Dedupe | Supported | 按协议、端点、认证身份和 transport fingerprint，不按显示名 |
| Merge | Supported | 按画布输入顺序合并，不隐式去重 |
| Limit | Supported | 确定性保留前 N 个节点 |

Latency Sort 明确返回 `SPEED_TEST_REQUIRED`，因为 V0.5 没有真实测速，也不会生成假延迟。每个 Processing Inspector 显示真实 input / output / removed 数量、问题和输入输出预览。物化 context 会缓存同一次编译中的 source / transform 结果。

## Target Compilation

Graph Compiler 可接收当前会话的 Subscription Snapshot，将解析后的标准代理注入 Universal IR。Target Compiler 只消费 IR：

- Mihomo：没有本地处理需求的未解析 URL 仍可保留为 remote `proxy-provider`；Paste、File、已刷新 URL 或任何需要本地处理的集合生成 explicit `proxies`。
- sing-box：Subscription 必须先 materialize，再生成 explicit outbound；未解析 URL 返回 `SINGBOX_SOURCE_REQUIRES_RESOLVED_PROXIES`。
- 两个目标都从同一规范化节点集合生成基础 HTTP、SOCKS5、Shadowsocks、Trojan、VMess 与 VLESS。
- Partial variants 被排除并产生目标 warning；无法保持策略或链路语义时仍返回 error、空内容和 `mock: false`。

## Known Limitations

- URL 能否刷新取决于订阅服务器 CORS policy。
- 不支持节点延迟测速、自动更新调度或后台刷新。
- 不实现 Reality、Vision、复杂 XTLS、Hysteria2、TUIC 或任意第三个 Target。
- Shadowsocks plugin 与协议扩展只保留基础 metadata，不能保证所有客户端插件运行环境都存在。
- 地区识别来自名称 hint，不检查 IP、ASN 或 GeoIP。
- Project Schema 保持 V2：新增项目字段均为可选，派生结果不进入 Project；Universal IR 仍保持 V2，因为此次扩展不破坏既有实体语义。

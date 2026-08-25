# Subscription Parser and Proxy Processing

ProxyFlow 1.2 在浏览器中读取订阅内容，将节点规范化为客户端无关的代理模型，再对真实节点集合执行处理并生成目标配置。Parser、ProxySet 处理和 Target Compiler 相互独立；Compiler 不负责下载或猜测订阅内容。

## Supported Input Formats

格式识别以内容为主、文件名为辅：

| Input | Status | Notes |
| --- | --- | --- |
| 每行一个分享链接 | Supported | 支持混合协议、空行与注释 |
| Base64 分享链接列表 | Supported | 解码后再次按内容识别 |
| Clash / Mihomo YAML | Supported | 只读取顶层 `proxies`，忽略策略组、规则等非节点内容并返回 info |
| Paste Content | Supported | 原文随 Project 保存，重开后可重新解析 |
| Local `.txt` / `.yaml` / `.yml` | Supported | 只在当前浏览器会话读取；Project 只保存文件名 |
| URL | Browser or Runtime | Local Mode 使用浏览器原生请求；Self-hosted Runtime 可使用受限请求兼容模式 |

默认拒绝超过 2 MiB 的输入和超过 5,000 个候选节点的订阅。HTTP 状态、声明长度、流式读取长度和请求超时分别检查。

### Subscription Request Profile

URL Subscription Source 可保存一个白名单请求兼容模式。它只影响 Self-hosted Runtime 的订阅下载，不参与 Primary Target 或 Target Compiler 选择：

| Profile | Runtime User-Agent | Behavior |
| --- | --- | --- |
| Auto | `Clash.Meta` first | 只有服务器明确返回 HTTP 403 / 406 时，才依次尝试 `mihomo`、`sing-box`、`ProxyFlow-Runtime/1.0` |
| Mihomo / Clash.Meta | `Clash.Meta` | 单次 Mihomo-compatible 请求，不自动切换 profile |
| sing-box | `sing-box` | 单次 sing-box-compatible 请求 |
| Generic | `ProxyFlow-Runtime/1.0` | 单次通用请求 |

Auto 是 provider compatibility 策略，不会根据当前 Mihomo / sing-box 编译目标改变同一 Source 的 materialized snapshot。404、401、429、5xx、TLS、DNS、SSRF policy、timeout 与 abort 不触发 User-Agent fallback；所有有限重试共享一次总截止时间，且每次请求与重定向都重新执行原有公网地址验证。Profile 是严格枚举，不支持自定义 User-Agent 或任意 HTTP header。

浏览器原生 `fetch` 不能可靠覆盖 `User-Agent`。因此 Local Mode 会保存该字段，但浏览器直接刷新不会应用请求兼容模式；需要 provider negotiation 的 URL 应通过 Self-hosted Runtime 刷新。

### Remote Source Export Mode

URL Subscription 另有一个 target-neutral 导出方式；Paste、Local File 与 Manual Proxy 始终 materialized：

| Mode | Semantics |
| --- | --- |
| Auto | 目标 capability、Request Profile 与当前处理路径可无损表达时保留远程订阅，否则导出当前 snapshot |
| Remote | 强制目标客户端直接加载远程订阅；目标或路径不支持时编译失败，不会静默固化 |
| Materialized | 始终导出当前已解析节点，用于固定当前节点版本 |

旧 Project 中没有该字段的 URL Source 会迁移为 Materialized，保持历史输出不变；新建 URL Source 默认 Auto。切换 Primary Target 不会修改 Source 的导出方式。

Remote export 不跳过 fetch 或 parse。ProxyFlow 仍保留当前 snapshot 用于 Nodes Preview、地区与兼容性分析、processing preview、semantic validation，以及不支持 native remote 的目标回退。目标客户端之后自行刷新时，运行时节点可能与当前 snapshot 不同，Compiler 会产生 `REMOTE_SOURCE_RUNTIME_DRIFT` info。

## Supported Protocols

下表表示 ProxyFlow 1.2 的基础字段与现代 TLS / transport 映射，不表示支持协议的所有扩展组合。

| Protocol | Parser | Mihomo | sing-box |
| --- | --- | --- | --- |
| HTTP / HTTPS proxy | Supported | Supported | Supported |
| SOCKS5 | Supported | Supported | Supported |
| Shadowsocks | Supported | Supported | Supported |
| Trojan | Supported | Supported | Supported |
| VMess | Supported | Supported | Supported |
| VLESS | Supported | Supported | Supported |
| VLESS Reality / Vision | Supported | Supported | Supported |
| Hysteria2 | Supported | Supported | Supported |
| TUIC v5 | Supported | Supported | Supported |
| AnyTLS | Supported normalized subset | Supported normalized subset | Supported normalized subset |

HTTP、SOCKS5 支持基础认证；Shadowsocks 支持 method、password 与可识别的 plugin metadata；Trojan、VMess、VLESS 支持 TLS、SNI 和 transport intent。Reality 使用同一 `ProxyTlsIR` 保存 client fingerprint、public key 与 short ID，Vision 使用受限 flow enum。Hysteria2 authority 支持单端口、逗号分隔端口与范围，缺省端口为 443；TUIC 保存 allow-insecure 与 disable-SNI。AnyTLS 支持官方 `anytls://password@host[:port]` URI（缺省 443）、`sni` / `insecure`，并显式读取可同时映射的 fingerprint、ALPN 与 idle-session 扩展；第三方 URI 中冗余的 `security=tls`、`type=tcp` 会被兼容归一化，`allowInsecure` / `allow_insecure` / `allow-insecure` 作为 `insecure` 的严格布尔 alias 处理。Clash/Mihomo YAML 读取相同的 normalized subset。所有端口必须在 1–65535，VMess/VLESS/TUIC UUID 会验证格式。

## Partially Supported Variants

未知 VLESS security / XTLS flow、冲突的 Reality/Vision 安全字段、非法 VMess TLS/aid/TCP header、TLS disabled 时出现 TLS-only 字段、非法 WS early-data、无可靠目标映射的 gRPC authority、未知 transport、显式非法 Hysteria2 bandwidth、Hysteria2 `pinSHA256` / ECH、Clash TLS certificate fingerprint，以及 AnyTLS 的未知连接关键参数或 Reality intent 不会被猜测。Parser 将此类节点标记为 `Partial`，保留节点名称、协议和问题原因；Import Summary 仍计入 detected / warnings，Node Preview 也继续展示它们。

重复参数按语义分类：普通 metadata warning 与相同值重复可以保持 Ready；SNI/serverName、security、flow、encryption、ALPN、client fingerprint、Reality public key / short ID、transport、Host/path、gRPC service name、early-data 与 XHTTP mode 等连接关键字段若出现不同值，返回 `PROXY_PARAMS_CONFLICT` 并标为 Partial。选择第一个值只用于保留可检查的规范化记录；target-neutral ProxySet 保留该节点，具体 Target 再按语义决定是否可编译。

Partial 节点会保留在 target-neutral ProxySet，并由目标兼容性检查返回带目标前缀的 warning、跳过可替换候选，或对显式不兼容 intent 失败闭合。其余 ready 节点仍可正常编译；如果某个目标的集合里没有可安全生成的成员，消费它的 Strategy 会失败闭合。

## Unsupported Protocols

Hysteria v1、WireGuard、Snell、SSH 等尚未进入协议模型。损坏的 AnyTLS 链接与其他未知 scheme、损坏链接和无法识别的行一样，会作为 `Unsupported` 节点与稳定 issue code 出现在预览中，而不是静默删除。

## CORS Limitations

ProxyFlow 1.2 的 Local Mode 仍是纯前端应用。URL Refresh 使用浏览器原生 `fetch`：

- 订阅服务器允许跨域时，可以直接刷新。
- CORS 或网络失败显示为 `CORS blocked`，不会误报为 Parser Error。
- 用户可以改用 Paste Content 或 Import File。
- 刷新失败不会清空上次成功结果；UI 同时显示 Last successful 和 Latest attempt，并将旧结果标记为 stale。

Self-hosted Runtime 可以在不放宽 SSRF 边界的前提下代替浏览器获取 URL；Local Mode 不包含 Worker、浏览器扩展或公共 CORS proxy。

Runtime 请求支持 `gzip`、`deflate`、`br` 和 identity 响应。wire bytes 与解压后的 bytes 都按 Subscription 最大大小限制流式计数；未知或损坏的 `Content-Encoding` 会作为稳定的 fetch error 返回，不会把压缩字节当作 UTF-8 交给 Parser。

## Security Model

- Node Preview 只显示名称、协议、地区、掩码后的服务器、端口、非秘密 security/transport 摘要和解析状态，不显示 password、UUID、Reality key、token 或完整分享链接。
- UI issue 和 fetch error 不拼接订阅 URL 或认证信息；订阅 URL 展示场景可使用 query redaction。
- 节点 ID 与 identity fingerprint 是稳定、不可读的 opaque hash，不包含原始 secret。
- Paste Content 是可恢复的用户项目输入，因此会随本地 Project 保存；Local File 原文和所有派生 ParseResult / ProxySet snapshot 都不会保存。
- 生成可运行的 Mihomo / sing-box 配置必然需要写入代理认证字段。Preview 和导出属于用户主动请求的最终配置，不是脱敏诊断视图。
- 所有示例、fixtures 和测试凭据均为虚构值与 `example.com` 域名。

## Node Normalization

Parser 输出真正的 discriminated union：HTTP、SOCKS5、Shadowsocks、Trojan、VMess、VLESS、Hysteria2、TUIC、AnyTLS 各自只拥有协议需要的字段。共同字段包括 stable ID、name、server、port 和 metadata；metadata 可以包含 source、region hint 与 compatibility hint。

地区识别优先读取节点名中的国旗 emoji，再匹配常见地区关键词。当前内置 HK、US、JP、SG、TW、KR、UK、DE、FR、CA、AU 与 UNKNOWN，并保留 confidence 和识别来源。地区只是可解释的 hint，不伪装成精确地理定位。

## Transforms

所有处理都在 materialized ProxySet 上真实执行：

| Transform | 1.0 status | Semantics |
| --- | --- | --- |
| Filter | Supported | 新 UI 使用 Keyword / Region / Regex + Include / Exclude；旧项目的组合字段继续可读取 |
| Rename | Supported | regex replacement；无效表达式返回稳定错误 |
| Sort | Supported | name、region、protocol；稳定排序 |
| Dedupe | Supported | 按协议、端点、认证身份和 transport fingerprint，不按显示名 |
| Merge | Supported | 按画布输入顺序合并，不隐式去重 |
| Limit | Supported | 确定性保留前 N 个节点 |

Latency Sort 明确返回 `SPEED_TEST_REQUIRED`，因为当前稳定版本没有真实测速，也不会生成假延迟。每个 Processing Inspector 显示真实 input / output / removed 数量、问题和输入输出预览。物化 context 会缓存同一次编译中的 source / transform 结果。

Filter 的 persistent model 使用可选字段，不提升 Project Schema V2：Keyword 会 trim 并按不区分大小写的 substring 确定性匹配；空输入为 no-op。Region 使用 ISO 3166-1 alpha-2 code（历史 `UK` 规范化为 `GB`），显示文本随 locale 变化但不修改 project semantics；地区仅从 flag、明确 token 与本地化名称推断，不做 GeoIP。Regex 使用 JavaScript-compatible pattern 与独立 ignore-case flag；非法表达式返回 `FILTER_INVALID_REGEX`、不运行该 transform，也不回退为 keyword。

## Target Compilation

Graph Compiler 可接收当前会话的 Subscription Snapshot，将解析后的标准代理与 target-neutral remote descriptor 一并注入 Universal IR。Target Compiler 只消费 IR：

- Mihomo：有当前 snapshot、未经过 processing、Request Profile 为 Auto 或 Mihomo / Clash.Meta 的 URL Source 可降低为 HTTP `proxy-provider`；策略组以 `use` 引用稳定 provider key。Auto 使用 `Clash.Meta` 作为目标原生请求标识，但目标无法复现 Runtime 的多 UA fallback chain，因此产生 `REMOTE_REQUEST_FALLBACK_NOT_PORTABLE` info。
- Mihomo：sing-box / Generic Request Profile、所有 Transform、Fixed identity 与 Proxy Chain hop 在 Auto 下 materialize；Remote 模式下返回稳定 error。Provider 使用 target 的确定性 refresh interval，不复用 Runtime scheduler interval。
- Surge：Auto / Materialized 使用当前 snapshot，并只投影 active strategy path 中可由 Surge 无损表示的节点；可替换的不兼容候选被跳过并聚合 warning，显式不兼容的 Fixed intent 与强制 Remote 继续失败闭合。
- sing-box：当前未声明 native remote proxy source capability；Auto / Materialized 生成 explicit outbound，Remote 返回 `REMOTE_SOURCE_TARGET_UNSUPPORTED` 与 `REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED`。
- Mihomo 与保留的 sing-box Compiler 从同一规范化节点集合生成其文档覆盖的基础协议、Reality/Vision、Hysteria2、TUIC 与现代 transport。Hysteria2 端口范围由 target lowering 分别写成 Mihomo `start-end` 与 sing-box `start:end`；Surge 仅 lowering 其独立文档声明的受支持子集。
- sing-box 1.13.14 的 HTTP V2Ray transport 由 TLS 状态决定 HTTP/1.1 或 HTTP/2：仅 HTTP+无 TLS 与 H2+TLS 能保留当前 IR intent；HTTP+TLS 返回 `SINGBOX_TRANSPORT_HTTP_TLS_VARIANT_UNSUPPORTED`，H2+无 TLS 返回 `SINGBOX_TRANSPORT_H2_REQUIRES_TLS`。
- XHTTP 只 lowering 到 Mihomo；sing-box 1.13.14 返回 `SINGBOX_TRANSPORT_XHTTP_UNSUPPORTED` 并失败闭合。
- Hysteria2 随机 hop interval 可 lowering 到 Mihomo；sing-box 1.13.14 不支持 `hop_interval_max`，返回 `SINGBOX_HYSTERIA2_RANDOM_HOP_INTERVAL_UNSUPPORTED` 并失败闭合。
- Partial variants 会进入各 Target 的兼容性检查并产生目标 warning；可替换候选可按目标策略跳过，无法保持策略或链路语义时仍返回 error、空内容和 `mock: false`。
- AnyTLS 的 Mihomo lowering 支持 password、SNI、insecure、ALPN、client fingerprint、UDP 与 idle-session 字段；sing-box 1.13.14 支持对应 TLS / uTLS / idle-session 与 Dial Fields `detour`。显式 AnyTLS `udp: false` 在 sing-box 返回 `SINGBOX_ANYTLS_UDP_DISABLE_UNSUPPORTED`。

## Known Limitations

- URL 能否刷新取决于订阅服务器 CORS policy。
- 不支持节点延迟测速、自动更新调度或后台刷新。
- 不实现除 Vision 外的复杂 XTLS flow、Hysteria v1 或任何额外 Target。
- Shadowsocks plugin 与协议扩展只保留基础 metadata，不能保证所有客户端插件运行环境都存在。
- Hysteria2 `pinSHA256`、ECH 与 Clash certificate fingerprint 当前为 Partial；不会以普通 warning 继续编译。
- Hysteria2/TUIC 上的 client fingerprint 虽可由 Universal TLS IR 表达，但 Mihomo 与 sing-box 1.13.14 的 QUIC TLS lowering 均拒绝该组合，不会静默省略。
- AnyTLS URI 依据 [anytls-go URI scheme](https://github.com/anytls/anytls-go/blob/main/docs/uri_scheme.md)。官方只定义 password、host/port、`sni` 与 `insecure`；第三方连接关键参数只有在已明确建模时才接受，否则标为 Partial。AnyTLS + Reality 与 sing-box 1.13.14 尚不存在的 `client_metadata` 不受支持。
- AnyTLS URI 的 `keepalive` 尚无经过验证的跨目标 portable semantic mapping，因此不会生成猜测的 IR 或 lowering；它继续以 `PROXY_PARAMS_UNRECOGNIZED` warning 可见。
- 地区识别来自名称 hint，不检查 IP、ASN 或 GeoIP。
- Project Schema 保持 V2：新增项目字段均为可选，派生结果不进入 Project；Universal IR 仍保持 V2，因为此次扩展不破坏既有实体语义。
- Remote export 会把 URL（通常含 credential）写入用户主动导出的目标配置；URL 不会进入 diagnostic message 或日志。ProxyFlow 不开放 custom header，Mihomo header 只由白名单 Request Profile adapter 生成。

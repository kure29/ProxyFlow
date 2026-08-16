# ProxyFlow

ProxyFlow 是一个通用代理配置可视化编排器。用户通过拖、连、点、改来表达流量路径，再由独立 Compiler 转换为目标配置。

> 你决定流量怎么走，ProxyFlow 负责配置怎么写。

## 当前版本

当前版本是 ProxyFlow V0.6 Modern Protocols。ProxyFlow 可以在浏览器中读取用户粘贴、导入或直接刷新的订阅，识别并处理真实代理节点，再由同一份 Universal IR 生成真实、可解析的 Mihomo YAML 或 sing-box JSON。

V0.6 在基础 HTTP/SOCKS5/Shadowsocks/Trojan/VMess/VLESS 之外，新增 VLESS Reality、XTLS Vision、WS early data、HTTP/H2、gRPC、HTTPUpgrade、Hysteria2 与 TUIC v5。Hysteria2 port hopping 在 Universal IR 中是结构化 single/range，分别 lowering 为 Mihomo 与 sing-box 语法；随机 hop interval 仅在 Mihomo Supported，sing-box 1.13.14 会失败闭合。XHTTP 同样只支持 Mihomo。core 层的 endpoint semantic firewall 同时保护 Share/Clash parser、manual/direct IR、`validateIR()` 与 target compiler；无法可靠保持认证、TLS、SNI 或连接语义的变体明确显示为 Partial 并从所有可用集合路径排除，普通 metadata warning 不自动降低节点兼容状态。sing-box 的 HTTP transport 仅在 HTTP+无 TLS 或 H2+TLS 时能保留当前 IR variant，反向组合返回稳定 compatibility error。

## 技术栈

- React + TypeScript + Vite
- `@xyflow/react` 可视化画布
- Zustand 状态与历史记录
- Lucide React 图标
- Vitest 轻量单元测试
- `yaml` 稳定序列化与 parse roundtrip
- 原生 CSS Design Tokens 与响应式布局

## 已实现

- 模块库单击添加与拖入画布
- 节点拖动、类型约束连线、框选、多选与删除
- Pan、Zoom、Fit View、MiniMap、自动布局
- 14 节点的完整 Demo Blueprint
- Source、Processing、Strategy、Chain、Routing、DNS、Output 节点视觉体系
- Subscription、Filter、Strategy、Proxy Chain、Routing、DNS、Output 专属 Inspector
- URL、Paste Content 与本地 `.txt/.yaml/.yml` Subscription 输入
- 分享链接、Base64 列表与 Clash YAML `proxies` 的内容优先格式识别
- HTTP、SOCKS5、Shadowsocks、Trojan、VMess、VLESS、Hysteria2、TUIC v5 的标准化代理模型
- VLESS Reality / Vision 与统一 TLS security intent
- WS early data、HTTP/H2、gRPC、HTTPUpgrade 与目标专属 XHTTP lowering
- Hysteria2 authority 多端口、默认 443、结构化 hop interval 与 target-specific serialization
- TUIC allow-insecure / disable-SNI lowering；未知安全语义与连接关键参数冲突失败闭合
- Import Summary、协议/地区统计、Partial/Unsupported issue 与安全 Node Preview
- CORS / Parser / Source / Empty Result 分层错误与失败刷新缓存保留
- 真实 Filter、Rename、Sort、Dedupe、Merge、Limit 与逐节点 Processing Debug
- 服务路径高亮与无关节点淡化
- Proxy Chain Hop 添加、删除与排序
- 服务目标策略修改
- 基础图验证与节点内警告
- Undo / Redo 与键盘快捷键
- Storage Adapter 封装的本地自动保存
- 真实 Mihomo YAML 预览、复制与导出
- 真实 sing-box JSON 预览、复制与导出
- Mihomo / sing-box / Universal IR 三模式 Preview 与 Target Error 分层
- Visual Graph → Universal IR 的纯函数 Graph Compiler
- Source、Transform、Strategy、Route、Final、DNS、Output IR
- Graph Structure Validation 与独立 IR Semantic Validation
- Proxy Chain 自引用和多层循环检测
- Universal IR Developer Preview、复制与 JSON 导出
- Mihomo proxy-provider、策略组、规则、规则集与基础 DNS 编译
- Mihomo / sing-box 基础与现代代理协议的 explicit proxy / outbound 编译
- sing-box selector、URLTest、现代 Route Action、Rule Set 与基础 DNS 编译
- 基于 `override.dialer-proxy` 的 Provider Chain lowering
- 基于 `detour` 的 sing-box 2/3 Hop Chain lowering
- discriminated、客户端无关的 `ProxyEndpointIR` 与 Service inline matcher
- 异步 Compiler Registry 与 target chunk 按需加载
- 同一 IR → 两个 Compiler 的 cross-target fixtures 与能力缺口测试
- Stable name registry、兼容性错误码与失败闭合
- Project Schema V1 → V2 迁移及 Legacy Recovery UI
- GitHub Actions 测试与生产构建
- 1280px 以上桌面布局与小屏提示
- 中文 / English 全局切换与本地偏好保存，系统文案不混排，用户自定义内容保持原文

## 架构边界

```text
Visual Graph
    ↓
Graph Semantic Compiler
    ↓
Universal Proxy IR
    ↓
Semantic Validator
    ↓
Async Target Compiler Registry
    ↙                  ↘
Mihomo Compiler    sing-box Compiler
    ↓                  ↓
 YAML                 JSON
```

Graph / Project 是编辑器与本地存储的唯一事实来源，IR 是按需重新生成的只读派生物，不进行双写。`src/core/ir` 不依赖 React、Zustand、DOM 或 `@xyflow/react`。

Graph Compiler 使用显式 `EdgeSemantic` 和有类型引用生成 IR。规则优先级采用明确的 `routePriority`，缺失时使用稳定的 Graph node insertion order；Canvas 坐标不会影响业务语义。Proxy Chain 顺序只以 `hopIds` 为准，视觉 Edge 不一致时返回 warning。

Target Compiler Registry 注册轻量异步 loader；Mihomo 与 sing-box 代码只在目标被选中时进入会话。Surge、Loon、Quantumult X、Shadowrocket 与 Stash 仍未实现。完整说明见 [V0.6 Modern Protocols](docs/v0.6-modern-protocols.md)、[Core Architecture](docs/architecture.md)、[Mihomo Compiler MVP](docs/mihomo-compiler.md)、[sing-box Compiler](docs/singbox-compiler.md) 与 [IR Cross-target Findings](docs/ir-cross-target-findings.md)。

订阅解析器按需加载，解析结果和处理结果只存在当前运行时；Project 只保存用户输入。详细格式、协议、CORS、安全和处理矩阵见 [Subscription Parser and Proxy Processing](docs/subscription-parser.md)。

规则体验以 Service 为第一层。Demo 只引用 `ios_rule_script` 的公开 Remote Rule Provider URL，不复制第三方规则内容。来源项目位于 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)，其许可证为 GPL-2.0。

## 本地运行

```bash
npm install
npm run dev
```

质量检查：

```bash
npm test
npm run build
```

## 目录

```text
src/
  app/             应用装配、快捷键与自动保存
  components/      画布、节点、布局、检查器、预览
  core/
    graph/          编辑器连接约束与路径
    graphCompiler/  Visual Graph → Universal IR
    ir/             纯客户端无关领域模型
    proxy/          标准代理协议、身份、安全与地区 hint
    subscription/   格式检测、协议 Parser 与浏览器 Source Fetcher
    proxySet/       真实节点集合处理、缓存与运行时计数
    semanticValidation/ 独立 IR 校验与 Chain Cycle 检测
    compiler/       Target Compiler Registry
    project/        Project Schema Version 边界
  data/            Demo Blueprint、模块库与服务目录
  storage/         ProjectStorage 适配器
  store/           Zustand Builder Store 与历史记录
  types/           Universal Project 类型
  targets/mihomo/  Mihomo 专用 Model、Compatibility 与 Compiler
  targets/singbox/ sing-box 专用 Model、Compatibility 与 Compiler
```

## 明确不在 V0.6 中

后端、账号、数据库、CORS 代理、节点测速、自动刷新调度、远程规则同步/转换、除 Vision 外的复杂 XTLS flow、Hysteria2 pin/ECH、Clash certificate fingerprint、QUIC client fingerprint lowering、完整客户端 Schema、Runtime Inbound Profile、第三个 Target、配置发布 URL 与云同步均未实现。sing-box 1.13.14 没有 XHTTP transport，也没有随机 Hysteria2 hop interval 的 `hop_interval_max`；这些能力缺口均失败闭合而不是猜测降级。

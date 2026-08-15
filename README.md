# ProxyFlow

ProxyFlow 是一个通用代理配置可视化编排器。用户通过拖、连、点、改来表达流量路径，再由独立 Compiler 转换为目标配置。

> 你决定流量怎么走，ProxyFlow 负责配置怎么写。

## 当前版本

当前版本是 ProxyFlow V0.4 sing-box Compiler + Cross-target IR Stress Test。ProxyFlow 只编译一次 Visual Graph，再由同一份 Universal IR 生成真实、可解析的 Mihomo YAML 或 sing-box JSON。

两个 Compiler 都是有明确边界的功能子集，不代表完整支持对应客户端。订阅内容不会在编译期下载或解析，节点统计和测速仍是 Mock 数据。Mihomo 可以保留远程 provider 语义；sing-box 需要显式、已解析的 HTTP/SOCKS endpoint，否则返回兼容性错误。

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
- sing-box HTTP/SOCKS outbound、selector、URLTest、现代 Route Action、Rule Set 与基础 DNS 编译
- 基于 `override.dialer-proxy` 的 Provider Chain lowering
- 基于 `detour` 的 sing-box 2/3 Hop Chain lowering
- 最小客户端无关 `ProxyEndpointIR` 与 Service inline matcher
- 异步 Compiler Registry 与 target chunk 按需加载
- 同一 IR → 两个 Compiler 的 cross-target fixtures 与能力缺口测试
- Stable name registry、兼容性错误码与失败闭合
- Project Schema V1 → V2 迁移及 Legacy Recovery UI
- GitHub Actions 测试与生产构建
- 1280px 以上桌面布局与小屏提示

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

Target Compiler Registry 注册轻量异步 loader；Mihomo 与 sing-box 代码只在目标被选中时进入会话。Surge、Loon、Quantumult X、Shadowrocket 与 Stash 仍未实现。完整说明见 [Core Architecture](docs/architecture.md)、[Mihomo Compiler MVP](docs/mihomo-compiler.md)、[sing-box Compiler](docs/singbox-compiler.md) 与 [IR Cross-target Findings](docs/ir-cross-target-findings.md)。

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

## 明确不在 V0.4 中

后端、账号、数据库、真实订阅解析、节点测速、远程规则同步/转换、VLESS/VMess/Trojan/Hysteria2 等协议、完整客户端 Schema、Runtime Inbound Profile、第三个 Target、配置发布 URL 与云同步均未实现。

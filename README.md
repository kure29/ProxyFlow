# ProxyFlow

ProxyFlow 是一个通用代理配置可视化编排器。用户通过拖、连、点、改来表达流量路径，未来再由独立 Compiler 转换为 Mihomo、sing-box、Surge 等目标配置。

> 你决定流量怎么走，ProxyFlow 负责配置怎么写。

## 当前版本

当前版本是 ProxyFlow V0.2 Core Foundation。V0.1 的可视化编辑体验保持不变，V0.2 新增客户端无关的 Universal IR、Graph Compiler 与 Semantic Validator，让 ProxyFlow 能够解释画布表达的真实流量语义。

订阅、规则统计、测速、兼容性与目标配置输出仍是 Mock 数据。

## 技术栈

- React + TypeScript + Vite
- `@xyflow/react` 可视化画布
- Zustand 状态与历史记录
- Lucide React 图标
- Vitest 轻量单元测试
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
- Mock Mihomo 配置预览、复制与导出
- Visual Graph → Universal IR 的纯函数 Graph Compiler
- Source、Transform、Strategy、Route、Final、DNS、Output IR
- Graph Structure Validation 与独立 IR Semantic Validation
- Proxy Chain 自引用和多层循环检测
- Universal IR Developer Preview、复制与 JSON 导出
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
Target Compiler Registry (future)
    ↓
Mihomo / sing-box / Surge / ... (future)
```

Graph / Project 是编辑器与本地存储的唯一事实来源，IR 是按需重新生成的只读派生物，不进行双写。`src/core/ir` 不依赖 React、Zustand、DOM 或 `@xyflow/react`。

Graph Compiler 使用显式 `EdgeSemantic` 和有类型引用生成 IR。规则优先级采用明确的 `routePriority`，缺失时使用稳定的 Graph node insertion order；Canvas 坐标不会影响业务语义。Proxy Chain 顺序只以 `hopIds` 为准，视觉 Edge 不一致时返回 warning。

Target Compiler Registry 的接口已经调整为 `Universal IR → Target Config`，但 V0.2 不包含真实 Mihomo、sing-box 或 Surge Compiler。完整说明见 [Core Architecture](docs/architecture.md)。

规则体验以 Service 为第一层。Demo 中的 `ios_rule_script` 只保存来源名称、仓库引用和 Mock 元数据，没有复制规则文件。来源项目位于 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)，其许可证为 GPL-2.0。

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
    compiler/       未来 Target Compiler Registry
    project/        Project Schema Version 边界
  data/            Demo Blueprint、模块库与服务目录
  storage/         ProjectStorage 适配器
  store/           Zustand Builder Store 与历史记录
  types/           Universal Project 类型
```

## 明确不在 V0.2 中

后端、账号、数据库、真实订阅解析、节点测速、远程规则同步、协议解析、真实 Mihomo/sing-box/Surge Compiler、配置发布 URL 与云同步均未实现。

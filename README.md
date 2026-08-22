# ProxyFlow

> 你决定流量怎么走，ProxyFlow 负责配置怎么写。

ProxyFlow 是一个 Local-first 的代理配置编排器。你可以导入订阅、处理节点、创建策略、配置分流和 DNS，再从同一个 Project 输出不同客户端的配置。

当前正式 Export Target 为 **Mihomo** 和 **sing-box**。结构化的“配置”工作区与可视化“蓝图”编辑的是同一个 Project，可以随时切换。

## 能做什么

- 从 Subscription URL、粘贴内容或本地文件导入节点
- 识别分享链接、Base64 列表和 Clash / Mihomo YAML
- 预览节点，并检查协议、地区与目标兼容性
- 使用 Keyword、Region 或 Regex 筛选节点
- Rename、Sort、Dedupe、Merge 和 Limit 节点集合
- 创建 Selector、URL-Test、Fallback 与 Load Balance 策略
- 编排多跳 Proxy Chain
- 配置 Routing、Custom Rule 与 DNS
- 导出 Mihomo YAML 和 sing-box JSON
- 在合适的目标中保留远程订阅，或固化当前节点
- 独立使用 Local Mode，或连接可选的 Runtime Service

支持的代理协议包括 HTTP、SOCKS5、Shadowsocks、Trojan、VMess、VLESS、Hysteria2、TUIC 和 AnyTLS。格式与兼容性详情见 [Subscription Parser & Compatibility](docs/subscription-parser.md)。

## 工作方式

```text
输入 → 处理 → 策略 → 分流 → 检查 → 导出
```

### 配置

默认的结构化 Workspace。按照来源、节点、处理、策略、分流、DNS、检查和导出的顺序完成日常配置。

### 蓝图

同一个 Project 的可视化拓扑与高级编辑方式。蓝图与配置工作区共享数据，不是两套独立配置。

## 远程订阅

URL Subscription 可以选择导出方式：

| 模式 | 行为 |
| --- | --- |
| Auto | 目标支持且可以无损保留时使用远程订阅，否则固化当前节点 |
| Remote | 强制目标客户端直接加载远程订阅；无法安全表达时停止导出 |
| Materialized | 始终导出当前已经解析的节点 |

目前 Mihomo 可以原生使用 `proxy-provider`；sing-box 当前会继续固化为普通 outbounds。

即使选择 Remote，ProxyFlow 仍会保留当前 snapshot，用于节点预览、检查和兼容性分析。目标客户端自行刷新后，实际节点可能与当前预览不同。

> Remote 导出会把 Subscription URL 写入目标配置。URL 可能包含凭据，请妥善保管导出的文件。

## Local Mode

Local Mode 不需要账号、数据库或 Docker：

- Project 保存在当前浏览器
- 编译和导出在本地完成
- Runtime Service 不可用时仍可独立编辑现有 Project

浏览器直接抓取部分 Subscription URL 可能受到 CORS 限制。需要服务器抓取、定时刷新和快照时，可以使用 Runtime Service。

## Self-hosted

使用管理脚本安装：

```bash
curl -fL --output proxyflow.sh \
  https://raw.githubusercontent.com/kure29/ProxyFlow/main/scripts/proxyflow.sh

chmod +x proxyflow.sh
./proxyflow.sh install
```

常用命令：

```bash
./proxyflow.sh status
./proxyflow.sh update
./proxyflow.sh logs
```

服务默认监听 `127.0.0.1:17870`。推荐使用 Nginx、Caddy、1Panel 或其他反向代理提供 HTTPS。

完整的部署、安全边界和管理命令见 [Runtime Service](docs/runtime-service.md)。

## 导出目标

| Target | 状态 |
| --- | --- |
| Mihomo | 支持 |
| sing-box | 支持 |
| Surge | 计划中 |
| Loon | 计划中 |
| Quantumult X | 计划中 |
| Shadowrocket | 计划中 |
| Stash | 计划中 |

ProxyFlow 的核心模型与具体客户端解耦，未来通过 Target Capability / Compiler 接入新的导出目标。

## 项目状态

ProxyFlow 当前处于 **1.0 Release Candidate** 阶段。

当前重点：

- 真实客户端验收
- Mihomo / sing-box 双目标稳定
- 订阅兼容性
- 移动端与桌面端交互收口
- 1.0 Stable 前最终验证

具体版本与历史请查看 [GitHub Releases](https://github.com/kure29/ProxyFlow/releases)。

## 文档

- [Product Direction](docs/product-direction.md)
- [Architecture](docs/architecture.md)
- [Subscription Parser & Compatibility](docs/subscription-parser.md)
- [Runtime Service](docs/runtime-service.md)
- [V1.0 User Acceptance](docs/v1-user-acceptance.md)
- [Design](DESIGN.md)
- [Current Status](docs/current-status.md)

## 开发

```bash
git clone https://github.com/kure29/ProxyFlow.git
cd ProxyFlow

npm install
npm run dev
```

运行测试和构建：

```bash
npm test -- --run
npm run build
npm run runtime:build
```

## 技术栈

- React
- TypeScript
- Vite
- Zustand
- XYFlow
- Vitest
- YAML

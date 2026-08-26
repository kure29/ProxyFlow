<div align="center">
  <img src="src/assets/brand/proxyflow-logo.png" alt="ProxyFlow 标志" width="112" />
  <h1>ProxyFlow</h1>
  <p><strong>Universal Proxy Visual Builder</strong></p>
  <p>用可视化方式编排代理流量，并可靠地导出到不同客户端。</p>
  <p><a href="README.md">English</a> | <a href="README_zh.md">简体中文</a></p>
  <p>
    <a href="https://github.com/kure29/ProxyFlow/releases"><img src="https://img.shields.io/github/v/release/kure29/ProxyFlow?display_name=tag" alt="GitHub Release" /></a>
    <a href="https://github.com/kure29/ProxyFlow/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kure29/ProxyFlow/ci.yml?branch=main&label=CI" alt="CI 状态" /></a>
    <a href="https://github.com/kure29/ProxyFlow/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kure29/ProxyFlow" alt="许可证" /></a>
    <a href="https://github.com/kure29/ProxyFlow/stargazers"><img src="https://img.shields.io/github/stars/kure29/ProxyFlow" alt="GitHub Stars" /></a>
    <a href="https://github.com/kure29/ProxyFlow/network/members"><img src="https://img.shields.io/github/forks/kure29/ProxyFlow" alt="GitHub Forks" /></a>
  </p>
</div>

## 项目简介

ProxyFlow 是一个 **Universal Proxy Visual Builder（通用代理可视化构建器）**。
它不只是订阅转换器：一个 Local-first 的 Project 可以从输入源开始，经过可解释、
面向目标客户端的处理流程，最终生成配置。

```text
订阅 / 节点 → 节点处理 → 策略 → 代理链 → 分流 → DNS → 目标配置
```

整个流程以可视化、能力驱动和失败闭合为核心。当目标客户端无法安全表达某项意图，
或该行为尚未被证明时，ProxyFlow 会显示诊断，而不是静默改变语义。

## 产品预览

核心体验是围绕同一个 Project 进行查看、编辑和多目标导出。目前仓库还没有合适的
产品截图，因此不会放入虚构或第三方图片；本节保留了清晰的位置，未来可以直接加入
仓库内制作的产品截图。

## 主要能力

- **订阅输入** — URL、粘贴内容或本地文件。
- **节点处理** — Filter、Rename、Sort、Dedupe、Merge、Limit。
- **策略** — 手动选择、自动选择和故障转移流程。
- **代理链** — 建模多跳代理，同时保留目标兼容性检查。
- **分流与 DNS** — 表达流量规则、服务规则和解析器意图。
- **兼容性诊断** — 在导出前查看每个目标能够表达的内容。
- **Local Mode** — 不需要账号、Docker 或联网服务即可工作。
- **可选 Runtime Service** — 自托管的单用户伴随服务，用于浏览器受限的网络操作。

## 支持的目标客户端

| 目标 | 当前状态 |
| --- | --- |
| **Mihomo** | Supported；默认产品目标 |
| **Surge** | Supported |
| **Loon** | Supported |
| **Shadowrocket** | Evidence-bounded Supported；仅限已验证子集 |
| **sing-box** | 已注册；正式产品导出暂停且隐藏 |

Shadowrocket 的验收固定在**已验证客户端基线：Shadowrocket 2.2.65 build 2615**。
这表示证据边界，不是最低支持版本，也不代表所有版本都兼容。混合 IP-CIDR/GEOIP
优先级、IPv6 行为、原生远程来源、更丰富的 DNS 角色以及其他未经证明的客户端能力，
仍然不支持或会失败闭合。详见 [Shadowrocket 编译器](docs/shadowrocket-compiler.md)
和[验收记录](docs/shadowrocket-acceptance.md)。

Stash、Quantumult X 等计划目标目前还不是可导出的产品目标。

## ProxyFlow 如何工作

```text
可视化 Graph
    ↓
Graph Semantic Compiler
    ↓
Universal Proxy IR
    ↓
语义校验
    ↓
目标能力 / Adapter
    ↓
目标 Compiler
    ↓
客户端配置
```

所有目标适配器都使用同一个 Project 和 Universal Proxy IR。工程实现详见
[Architecture](docs/architecture.md)。

## 快速开始

### Local Mode

```bash
git clone https://github.com/kure29/ProxyFlow.git
cd ProxyFlow
npm install
npm run dev
```

Local Mode 将 Project 保存在当前浏览器中，不需要账号、Docker 或 Runtime Service。

### 自托管

```bash
curl -fL --output proxyflow.sh \
  https://raw.githubusercontent.com/kure29/ProxyFlow/main/scripts/proxyflow.sh
chmod +x proxyflow.sh
./proxyflow.sh
```

管理脚本支持交互式和脚本化的 install、update、start、stop、restart、status、logs、
backup 与 uninstall。可选服务和当前 immutable Compose 镜像见
[Runtime Service 文档](docs/runtime-service.md)。

## 兼容性与安全边界

目标支持由能力声明驱动，并不意味着所有客户端原生功能都能在每个目标上工作。
不支持或未经证明的意图会失败闭合；目标特定能力不会被静默降级。

## 文档

- [Product Direction](docs/product-direction.md) — 产品边界与目标策略
- [Architecture](docs/architecture.md) — Project、IR、校验与适配器
- [Subscription Parser & Compatibility](docs/subscription-parser.md)
- [Subscription Format Compatibility](docs/subscription-format-compatibility.md)
- [Runtime Service](docs/runtime-service.md)
- [Shadowrocket 编译器](docs/shadowrocket-compiler.md)与[验收记录](docs/shadowrocket-acceptance.md)

## 版本发布

当前稳定版本：**[v1.3.0](docs/releases/1.3.0.md)**

已发布的版本和说明见 [GitHub Releases](https://github.com/kure29/ProxyFlow/releases)。

## 许可证

[MIT License](LICENSE) © 2026 kure29

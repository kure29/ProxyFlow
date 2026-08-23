# ProxyFlow

> Universal Proxy Visual Builder

ProxyFlow 是一个 Local-first 的代理配置可视化编排器：从订阅输入、节点处理、策略和分流，到检查与 Mihomo 配置导出，始终使用同一个 Project。

## 主要能力

- URL / Paste / File Subscription
- Node parsing
- Filter / Rename / Sort / Dedupe / Merge / Limit
- Strategy
- Proxy Chain
- Routing
- DNS
- Remote Subscription / Mihomo `proxy-provider`
- Local Mode
- Runtime Service
- Mihomo YAML export

## Target Status

| Target | Status |
| --- | --- |
| Mihomo | Stable / Supported |
| sing-box | Official export paused |
| Surge | Planned |
| Loon | Planned |

sing-box 的底层编译与历史 Project 兼容能力仍然保留。Subscription Request Profile 也继续提供 Auto、Mihomo、sing-box 和 Generic；它只影响订阅请求格式，不代表 Export Target。

## Quick Start

### Local Mode

```bash
git clone https://github.com/kure29/ProxyFlow.git
cd ProxyFlow
npm install
npm run dev
```

Local Mode 不需要账号、Docker 或 Runtime Service，Project 保存在当前浏览器中。

### Self-hosted

```bash
curl -fL --output proxyflow.sh \
  https://raw.githubusercontent.com/kure29/ProxyFlow/main/scripts/proxyflow.sh
chmod +x proxyflow.sh
./proxyflow.sh
```

交互式菜单可用于安装、更新和日常管理；自动化环境仍可直接运行 `./proxyflow.sh install` 等子命令。服务默认监听 `127.0.0.1:17870`。Stable managed install/update 使用 `ghcr.io/kure29/proxyflow:latest`；仓库 Compose 默认固定到 immutable `ghcr.io/kure29/proxyflow:1.0.0`。完整说明见 [Runtime Service](docs/runtime-service.md)。

## Development

```bash
npm test -- --run
npm run build
npm run runtime:build
npm run test:deployment
npx tsc -b
```

更多资料见 [Product Direction](docs/product-direction.md)、[Architecture](docs/architecture.md) 和 [Subscription Parser & Compatibility](docs/subscription-parser.md)。

## License

[MIT License](LICENSE) © 2026 kure29

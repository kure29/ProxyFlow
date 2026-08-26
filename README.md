<div align="center">
  <img src="src/assets/brand/proxyflow-logo.png" alt="ProxyFlow logo" width="112" />
  <h1>ProxyFlow</h1>
  <p><strong>Universal Proxy Visual Builder</strong></p>
  <p>Design proxy traffic visually. Export confidently across clients.</p>
  <p><a href="README.md">English</a> | <a href="README_zh.md">简体中文</a></p>
  <p>
    <a href="https://github.com/kure29/ProxyFlow/releases"><img src="https://img.shields.io/github/v/release/kure29/ProxyFlow?display_name=tag" alt="GitHub Release" /></a>
    <a href="https://github.com/kure29/ProxyFlow/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kure29/ProxyFlow/ci.yml?branch=main&label=CI" alt="CI status" /></a>
    <a href="https://github.com/kure29/ProxyFlow/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kure29/ProxyFlow" alt="License" /></a>
    <a href="https://github.com/kure29/ProxyFlow/stargazers"><img src="https://img.shields.io/github/stars/kure29/ProxyFlow" alt="GitHub stars" /></a>
    <a href="https://github.com/kure29/ProxyFlow/network/members"><img src="https://img.shields.io/github/forks/kure29/ProxyFlow" alt="GitHub forks" /></a>
  </p>
</div>

## Introduction

ProxyFlow is a **Universal Proxy Visual Builder**. It is not merely a
subscription converter: one local-first Project takes you from source material
to an explainable, target-aware client configuration.

```text
Subscription / Nodes → Processing → Strategies → Proxy Chains → Routing → DNS → Target configuration
```

The workflow is visual, capability-driven, and fail-closed. When a target
cannot represent an intent safely—or the behavior is not proven—ProxyFlow
surfaces a diagnostic instead of silently changing the meaning.

## Product preview

The core experience is a single Project that can be inspected, edited, and
exported for different clients. No product screenshots are bundled yet; this
section is intentionally kept ready for future repository-native captures
without using fabricated or third-party imagery.

## Highlights

- **Subscription sources** — URL, pasted content, or local files.
- **Node processing** — Filter, Rename, Sort, Dedupe, Merge, and Limit.
- **Strategies** — Manual select, automatic selection, and failover workflows.
- **Proxy Chain** — Model chained hops while preserving target compatibility checks.
- **Routing and DNS** — Express traffic rules, service rules, and resolver intent.
- **Compatibility diagnostics** — See what each target can express before export.
- **Local Mode** — Work without an account, Docker, or a connected service.
- **Optional Runtime Service** — Self-host a single-user companion for browser-limited network work.

## Supported targets

| Target | Current state |
| --- | --- |
| **Mihomo** | Supported; default product target |
| **Surge** | Supported |
| **Loon** | Supported |
| **Shadowrocket** | Evidence-bounded Supported for the tested subset |
| **sing-box** | Registered; official product export paused and hidden |

Shadowrocket acceptance is pinned to the **tested client baseline: Shadowrocket
2.2.65 build 2615**. This is an evidence boundary, not a minimum-version or
universal-compatibility claim. Mixed IP-CIDR/GEOIP precedence, IPv6 behavior,
native remote sources, richer DNS roles, and other unproven client features
remain unsupported or fail closed. See the [Shadowrocket compiler](docs/shadowrocket-compiler.md)
and [acceptance record](docs/shadowrocket-acceptance.md).

Planned targets such as Stash and Quantumult X are not current export targets.

## How ProxyFlow works

```text
Visual Graph
    ↓
Graph Semantic Compiler
    ↓
Universal Proxy IR
    ↓
Semantic Validation
    ↓
Target Capability / Adapter
    ↓
Target Compiler
    ↓
Client Configuration
```

The same Project and Universal Proxy IR feed each target adapter. Read the
[architecture guide](docs/architecture.md) for the engineering model.

## Quick start

### Local Mode

```bash
git clone https://github.com/kure29/ProxyFlow.git
cd ProxyFlow
npm install
npm run dev
```

Local Mode keeps Projects in the current browser and does not require an
account, Docker, or Runtime Service.

### Self-hosted

```bash
curl -fL --output proxyflow.sh \
  https://raw.githubusercontent.com/kure29/ProxyFlow/main/scripts/proxyflow.sh
chmod +x proxyflow.sh
./proxyflow.sh
```

The manager supports interactive and scriptable install, update, start, stop,
restart, status, logs, backup, and uninstall workflows. See the
[Runtime Service guide](docs/runtime-service.md) for the optional service and
the current immutable Compose image.

## Compatibility and safety

Target support is capability-driven rather than a promise that every native
client feature will work everywhere. Unsupported or unproven intent fails
closed, and target-specific capabilities are never silently downgraded.

## Documentation

- [Product Direction](docs/product-direction.md) — product boundary and target policy
- [Architecture](docs/architecture.md) — Project, IR, validation, and adapters
- [Subscription Parser & Compatibility](docs/subscription-parser.md)
- [Subscription Format Compatibility](docs/subscription-format-compatibility.md)
- [Runtime Service](docs/runtime-service.md)
- [Shadowrocket compiler](docs/shadowrocket-compiler.md) and [acceptance](docs/shadowrocket-acceptance.md)

## Release

Current stable release: **[v1.3.0](docs/releases/1.3.0.md)**

See [GitHub Releases](https://github.com/kure29/ProxyFlow/releases) for
published release artifacts and notes.

## License

[MIT License](LICENSE) © 2026 kure29

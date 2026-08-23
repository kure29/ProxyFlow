# ProxyFlow Product Surface Design

Status: UI 2.0 design baseline

This document is the maintainable design contract for ProxyFlow. Product and
interaction rationale lives in [docs/ui-2.0.md](docs/ui-2.0.md); implementation
tokens live in `src/styles/tokens.css`.

## Product Model

ProxyFlow has one persistent Project and one Graph. Workspace and Visual Flow
are two views of that same state:

```text
Project / Graph
  |-- Workspace: default structured authoring
  `-- Visual Flow: topology and advanced graph editing
```

Neither view may introduce hidden semantic state, a conversion step, or a
second save format. An edit made in either view must be visible in the other
and survive the existing Project persistence path.

The permanent workflow is:

```text
Input -> Processing -> Strategy -> Routing -> Inspect -> Output
```

Workspace navigation presents that workflow as Sources, Proxies, Processing,
Strategies, Routing, DNS / Advanced, Inspect, and Export. Advanced concepts
stay behind contextual editors or disclosure controls rather than becoming new
top-level sections.

## Design Principles

- Clean: remove controls and labels that are not relevant to the current task.
- Calm: use neutral surfaces and one interaction color; reserve status colors
  for status.
- Precise: show capability and compiler limits explicitly and fail closed.
- Lightweight: prefer the existing React, CSS, and Lucide stack over another
  component framework or a large icon bundle.
- Local-first: present Local Mode as a complete product mode. Runtime Service
  is an optional enhancement, not a prerequisite.

## Semantic Tokens

`src/styles/tokens.css` is the source of truth. Components should consume
semantic variables, not recreate color or spacing values locally.

### Color

| Role | Token | Light value |
| --- | --- | --- |
| Primary | `--color-primary` | `#2f6fed` |
| Primary hover | `--color-primary-hover` | `#255fd1` |
| Primary soft | `--color-primary-soft` | `#eef4ff` |
| App background | `--color-app-background` | `#f7f9fc` |
| Surface | `--color-surface` | `#ffffff` |
| Subtle surface | `--color-surface-subtle` | `#f2f5f9` |
| Main text | `--color-text` | `#172033` |
| Secondary text | `--color-text-secondary` | `#475467` |
| Muted text | `--color-text-muted` | `#667085` |
| Border | `--color-border` | `#e4e9f0` |
| Success | `--color-success` | `#18a66a` |
| Warning | `--color-warning` | `#b86f12` |
| Danger | `--color-danger` | `#d94a4a` |
| Info | `--color-info` | `#4d7ff0` |

Blue means brand, interaction, focus, or selection. Green means success,
orange means warning, red means error or destructive action, and grey means
neutral structure. Product modules do not receive independent theme colors.
Third-party colors may appear inside verified brand artwork only.

The semantic layer makes a future dark theme possible, but Light Mode is the
UI 2.0 acceptance target. Dark Mode is not implied by these tokens.

### Typography

Use the system stack from `--font-sans`. Keep letter spacing at zero for normal
interface text.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title | `20px / 28px` | `600` |
| Section title | `15px / 22px` | `600` |
| Body | `13px / 18px` | `400` |
| Strong label | `13px / 18px` | `500-600` |
| Helper / metadata | `12px / 16px` | `400-500` |
| Code / machine value | `12px / 16px` | `400` |

Do not shrink Chinese helper text below a comfortably readable metadata size.
Use the mono stack only for generated configuration, diagnostic codes, and
other literal machine values.

### Spacing, Shape, And Motion

- Spacing scale: `4`, `8`, `12`, `16`, `24`, `32` pixels.
- Desktop control height: `34px`; compact controls and icon buttons: `28px`.
- Mobile touch target: at least `44px`.
- Control radius: `8px`; cards: `10px`; panels: `12px`.
- Borders are the normal container treatment. Shadows are reserved for actual
  floating panels.
- Motion lasts `140-180ms`, uses opacity or small transforms, and respects
  `prefers-reduced-motion`.

## Shared Controls

The small shared layer in `src/components/ui/Primitives.tsx` currently owns:

- `Button` with primary, secondary, quiet, and danger variants;
- `IconButton` with an accessible label and tooltip;
- `SegmentedControl` for mutually exclusive view choices;
- `StatusBadge` with semantic status tones.

Existing specialized controls may remain where their behavior is domain
specific. New repeated controls should reuse or extend this layer only when the
same behavior appears in more than one product surface.

## Shell And Navigation

The TopBar gives priority to the ProxyFlow mark, editable Project name,
Workspace / Visual Flow switch, save and Runtime status, Preview, and Export.
Language lives in the overflow menu. Canvas-only actions such as undo, redo,
layout, and fit appear only in Visual Flow.

Workspace uses a Project navigation sidebar. Visual Flow uses a collapsible
palette so the canvas retains most of the available width. The bottom status
bar is contextual: Workspace shows Project health and local save state; Visual
Flow may also show node, connection, and zoom information.

At desktop widths, editors use a non-modal right inspector and preserve the
main-page context. Medium widths use an overlay inspector. Mobile uses a
full-screen editor surface.

## Domain Patterns

### Routing

The primary add flow has two choices: Service Rule and Custom Rule. Service
selection presents recognizable service names; Custom Rule exposes Domain,
Domain Suffix, Domain Keyword, IPv4/IPv6 CIDR, and Port. Geo, ASN, Rule Set, raw
matcher data, and source provenance remain Advanced.

The list shows name, matcher summary, target, status, order, and actions. Order
is expressed visually and supports drag plus Move Up / Move Down buttons. A raw
priority field is not part of the basic workflow.

`ios_rule_script` may remain as provenance in Advanced details and compiler
data, but the main product term is Service Rule.

### DNS

One DNS Graph node owns an ordered list of resolver profiles. A resolver has a
name, protocol, endpoint, role, and enabled state. Presets are System,
Cloudflare, Google, Quad9, AliDNS, DNSPod, and AdGuard DNS. Roles are Default,
Direct, and Fallback.

Controls reflect the active supported Primary Target capability registry.
Mihomo differences remain explicit; unsupported roles or protocols are
disabled or reported as blockers, never approximated silently. Historical
sing-box Projects show a paused state and retain their data until the user
switches to Mihomo.

### Export

Export is a full Workspace page with Target, Target Configuration,
Compatibility, and final Preview / Export actions. Mihomo is the only
production target. sing-box is paused, and future targets are not presented as
ready actions.

The production surface validates and compiles the active supported target.
Cross-target capability and compiler registries remain available internally
without lowering Mihomo compatibility to a hidden target's common subset.

## Visual Flow

Visual Flow uses the same neutral surfaces, typography, focus treatment, and
status colors as Workspace. Node type is not communicated through large blocks
of unrelated color. Selected nodes use Primary Blue; warnings and errors use
small semantic indicators. Unselected and path-dimmed nodes remain readable.

The canvas stays lazy-loaded. Controls and the minimap remain visually quiet,
and mobile Visual Flow is optimized for overview, navigation, and inspection
rather than precise edge construction.

## Brand And Icons

- `src/assets/brand/proxyflow-logo.png` is the shared user-provided ProxyFlow logo used
  by the product shell. Favicon, Apple Touch, and PWA PNGs are derived from this
  borderless transparent-corner master.
- Product controls use Lucide stroke icons and accessible labels.
- Do not add glow, neon, 3D treatment, or an alternative ProxyFlow mark.
- Service-only third-party artwork must retain its exact source revision in
  `src/assets/services/SOURCES.md`; it must never replace product navigation or
  target icons.

## Responsive And Accessibility Contract

- Desktop (`>=1024px`): sidebar, main content, and optional non-modal inspector.
- Tablet (`768-1023px`): compact or collapsed navigation and overlay inspector.
- Mobile (`<768px`, including `390px`): single-column Workspace, compact
  section selector, full-screen editors, and `44px` touch targets.

Every primary workflow must work without Visual Flow. No supported viewport may
introduce horizontal page scrolling or clipped target names and actions.
Interactive elements require keyboard access, visible focus, semantic labels,
and text or icon cues in addition to color. Routing order must always have a
non-drag alternative.

## Change Checklist

Before accepting a product-surface change:

1. Confirm Workspace and Visual Flow still edit the same Project and Graph.
2. Confirm capability-dependent controls agree with compiler behavior.
3. Check Chinese and English at desktop, medium, and `390px` widths.
4. Check keyboard focus, labels, mobile targets, wrapping, and overflow.
5. Cold reload and verify there are no new browser errors or warnings.
6. Run focused tests, the full test suite, production builds, and
   `git diff --check` according to `AGENTS.md`.

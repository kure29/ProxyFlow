# ProxyFlow Responsive Layout Contract

Status: ProxyFlow 1.1

This document records the durable implementation rules for the responsive
layout and typography system. Product behavior, Project state, capability
declarations, validation, and compiler semantics remain unchanged.

## Breakpoints

- Mobile: `<768px`.
- Tablet: `768-1023px`.
- Desktop: `>=1024px`.
- Required QA widths: `375`, `390`, `430`, `768`, `1024`, and `1440` pixels.

Breakpoints describe composition changes, not a license to hide primary
functionality. Every viewport must avoid horizontal page overflow, clipped
primary actions, and fixed controls that overlap content or safe areas.

## Foundation Tokens

`src/styles/tokens.css` is the implementation source of truth.

### Spacing

| Token | Value | Typical use |
| --- | ---: | --- |
| `--space-1` | `4px` | icon/text gaps, badges |
| `--space-2` | `8px` | compact controls and list internals |
| `--space-3` | `12px` | mobile cards and compact form rows |
| `--space-4` | `16px` | desktop cards and standard sections |
| `--space-6` | `24px` | large cards and page regions |
| `--space-8` | `32px` | desktop page gutters |

### Typography

| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title | `20px / 28px` | `600` |
| Section title | `15px / 22px` | `600` |
| Body / form label | `13px / 18px` | `400` |
| Metadata | `12px / 16px` | `400-500` |
| Code / machine value | `12px / 16px` | `400` |

Generated configuration, domains, regular expressions, CIDRs, ports, and
endpoints use the mono stack. Ordinary interface copy does not.

### Controls And Cards

- Desktop buttons and form controls: `34px`.
- Compact desktop controls: `28px`.
- Desktop icon buttons: `28px` with `16px` icons.
- Mobile primary interactions: at least `44px` in both dimensions, with
  `18-20px` icons where the icon is the primary cue.
- Desktop card padding: `16px`; compact/mobile card padding: `12px`.
- Normal cards use a border, not decorative elevation. Shadows are reserved
  for floating panels, popovers, sheets, and dialogs.

## Responsive Composition Rules

- Mobile surfaces use deliberate single-column or card compositions; desktop
  tables must not merely wrap.
- Workspace, Visual Flow, editors, dialogs, and sheets continue to read and
  write the same Project and Graph.
- Mobile dialogs use a full-screen modal for long forms or configuration
  previews, a bottom sheet for contextual selection, and an action sheet for
  compact action groups.
- Fixed mobile navigation and sheets include the relevant `env(safe-area-*)`
  inset and reserve matching content space.
- Routing always exposes a non-drag move alternative. Capability-dependent DNS
  and Export controls remain registry-driven and fail closed.

## Mobile Shell And Workspaces

The mobile TopBar is `52px` plus the top safe-area inset. It contains only the
Project menu, ProxyFlow mark, current Primary Target, Project-health status,
and Export action. The Project menu retains mobile access to Project rename,
Project selection, and Project creation without expanding the persistent
header.

Workspace navigation is fixed to the bottom at `56px` plus the bottom safe-area
inset. Its five destinations are Sources / Proxies, Processing, Strategies,
Routing, and More. Sources / Proxies and More open focus-managed navigation
drawers; More owns DNS / Advanced, Inspect, and Export. Content reserves the
same bottom space, and the mobile StatusBar is replaced by the TopBar health
indicator and bottom navigation.

Mobile Routing uses bordered two-line cards. The first line contains order,
matcher, and status; the second contains the editable target and Up, Down, and
More actions. Matcher machine values use the mono scale. Drag remains
available, but the `44px` move controls are the keyboard and touch alternative.

Mobile DNS uses one resolver card per row. Resolver fields remain capability
driven, unsupported state remains explicit, endpoint values use the mono scale,
and all form, enabled, delete, and Add interactions are at least `44px`.

## Desktop Shell And Workspaces

Desktop composition starts at `1024px`. The TopBar is `52px`, the persistent
Workspace Sidebar is `200px`, and ordinary page content is centered within the
shared `1100px` content primitive. Routing, Proxies, and Export may use the
remaining desktop width when their denser controls need it. The active Sidebar
destination uses a visible left indicator in addition to color and background.

Sources and Proxies use two-column desktop card grids. Source cards expose
format, health, safe host metadata, node count, refresh state, and compact
actions. Proxy filters present Region and Protocol as counted horizontal facets
while Source, source availability, and compatibility remain secondary selects;
cards only show Project-derived metadata and never invent latency data.

Processing remains an ordered vertical pipeline with explicit connectors and
non-drag move controls. Routing uses compact `52px`-class rows with matcher
values on the mono scale and directly editable targets. DNS uses a two-column
resolver-card grid, while tablet and mobile retain the one-card-per-row
composition and capability-driven fail-closed behavior.

## Tablet Composition

From `768px` through `1023px`, Workspace uses a horizontal five-destination
navigation rail above page content; Sources / Proxies and More retain the same
focus-managed drawers used by the compact shell. At `768-900px`, the TopBar
uses two rows so Project identity, view switching, and primary actions do not
collide; the single-row TopBar returns above `900px`.

Tablet Visual Flow retains a `48px` collapsed Block Library rail and lets the
Canvas consume the remaining width. Selecting a node or edge opens the
Inspector as a `360px` overlay aligned to the viewport edge, so the grid does
not collapse the panel into its inactive zero-width column.

## Visual Flow

Desktop Visual Flow uses the same `>=1024px` boundary as Workspace. Its Block
Library defaults to `220px`, resizes within conservative bounds, and collapses
to a `48px` icon rail. The Inspector defaults to `360px`, consumes no Canvas
space while there is no node or edge selection, and always exposes an explicit
close control. Stored widths use versioned keys so the refactor defaults take
effect without interpreting a legacy width as the new default.

Undo, Redo, Fit View, Auto Layout, and current zoom live in a low-emphasis
floating control group centered along the Canvas bottom edge. They are not
duplicated in the TopBar or StatusBar. The Canvas, Block Library, and Inspector
continue to operate directly on the shared Project Graph.

Below `768px`, Visual Flow remains an explicit secondary view entered from the
mobile Project menu. The Block Library is hidden until the `Add node` control
opens a safe-area-aware bottom sheet. Selecting a node or edge opens the
Inspector as a scrollable `60dvh` bottom sheet. Both sheets lock page scrolling,
trap keyboard focus, close with Escape or their close control, restore focus,
and use `44px` primary interactions.

## Export And Mobile Overlays

At `>=1024px`, Export uses a two-pane composition. The left pane orders Target,
Compatibility, Status, and Configuration as a single review flow. The right
pane is a bounded, sticky configuration preview with target format, Copy and
Export actions, line numbers, lightweight syntax highlighting, and internal
code scrolling. Compiler blockers stay explicit; the preview never substitutes
mock configuration for a failed compile.

Below `768px`, target and configuration options remain single-column and the
inline code pane is replaced by the full-screen Preview modal. Long-form Project
creation and Preview use full-screen dialogs; target selection, routing-rule
insertion, and confirmations use bottom sheets; routing contextual actions use
an action sheet with Edit, Copy, Move, and Delete choices. These overlays honor
safe-area insets, lock page scrolling, trap focus, close with Escape when the
workflow permits, and restore focus to a persistent launcher.

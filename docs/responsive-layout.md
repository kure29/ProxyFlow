# ProxyFlow Responsive Layout Contract

Status: Active refactor contract

This document records the durable implementation rules for the responsive
layout and typography refactor. Product behavior, Project state, capability
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

## Phase Checkpoints

- Phase 1: semantic spacing, typography, control, icon-button, card, code, and
  responsive foundation tokens.
- Phase 2: mobile shell, navigation, Routing, DNS, and touch targets.
- Phase 3: desktop shell and Workspace pages.
- Phase 4: Visual Flow panels and mobile sheets.
- Phase 5: modal, action-sheet, and Export compositions.
- Phase 6: full breakpoint polish and regression verification.

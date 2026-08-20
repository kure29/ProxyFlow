# ProxyFlow UI 2.0

Status: implementation on `autopilot/ui2`; final acceptance gates pending

UI 2.0 is a product-surface refactor over the existing ProxyFlow Project,
Graph, parser, runtime, IR, validation, and Mihomo/sing-box compiler pipeline.
It does not create a second editor model or change ProxyFlow into a proxy
client, hosted account product, or one-shot converter.

## One Project, Two Views

Workspace is the default structured authoring surface. Visual Flow remains an
always-available topology and advanced editing surface. Both read and write the
same Zustand-backed Project and Graph and use the same persistence, undo/redo,
validation, and compiler paths.

```text
                        Project / Graph
                             |
                 +-----------+-----------+
                 |                       |
             Workspace              Visual Flow
       structured primary editor   topology and advanced editing
```

There is no conversion, synchronization command, duplicate storage, or second
IR between the two views.

## Product Surface

Workspace follows the project workflow through eight compact sections:

```text
Sources -> Proxies -> Processing -> Strategies -> Routing
        -> DNS / Advanced -> Inspect -> Export
```

The shell keeps the ProxyFlow brand, editable Project switcher, and Workspace /
Visual Flow switch visible. Save state, Runtime status, Preview, and Export are
contextual. Canvas layout controls appear only in Visual Flow, Source refresh
actions live on Sources, and language selection lives in the overflow menu.

Desktop editors use a non-modal right inspector where space permits. Tablet
uses an overlay inspector. Mobile uses a full-screen editor and a compact
section selector rather than eight compressed navigation icons.

## Design Foundation

The new semantic layer is defined in `src/styles/tokens.css` and applied through
the `ui2` CSS layer. It covers color, typography, spacing, radii, shadows,
control sizes, layout widths, z-index, and motion. Compatibility aliases keep
older product surfaces functional while they move to semantic names.

The visual direction is Calm Blue plus neutral surfaces:

- blue: brand, interaction, selection, and focus;
- green: success;
- orange: warning;
- red: error or destructive action;
- grey: neutral structure.

The shared primitive layer currently provides Button, IconButton,
SegmentedControl, and StatusBadge. It deliberately avoids a new UI framework.
See [DESIGN.md](../DESIGN.md) for the maintainable token and interaction
contract.

## Routing

The Workspace Routing page presents one ordered rule list. Adding a rule starts
with two user-facing choices:

- Service Rule: search and select a known service such as OpenAI, Claude,
  Telegram, YouTube, or Netflix.
- Custom Rule: choose Domain, Domain Suffix, Domain Keyword, IPv4/IPv6 CIDR, or
  Port and enter the matcher value.

Rows summarize the matcher and target instead of exposing the full matcher
model. Users can reorder rules by drag or accessible Move Up / Move Down
actions. Missing matchers, broken targets, compatibility issues, disabled
rules, and healthy rules use distinct semantic states.

The stored legacy node types and `routePriority` semantics remain compatible.
`ios_rule_script` is retained only as compiler/source provenance and Advanced
detail; it is not the main Routing concept. The service presentation helper is
tested to exclude that internal source name from normal rule summaries.

Claude intentionally uses the neutral `C` text fallback. The previous catalog
mapping pointed at an unrelated mark, and no verified official asset is bundled.

## DNS

UI 2.0 adds multiple resolver profiles without replacing the existing DNS
Graph concept. A Project still owns at most one active DNS node, and that node
may contain multiple `dnsResolvers` entries:

```text
DnsResolverConfig {
  id
  name
  kind: doh | dot | udp | system
  role: default | direct | fallback
  address?
  enabled
  presetId?
}
```

Project Schema remains `2`. `dnsResolvers` is an optional additive node field;
the old single `resolver` value is normalized into a Default resolver when
loaded or compiled. A second active DNS owner fails closed with `DNS_MULTIPLE`
instead of dropping resolver semantics.

The preset catalog includes System, Cloudflare, Google, Quad9, AliDNS, DNSPod,
and AdGuard DNS. Custom DoH, DoT, and UDP entries are also supported by the UI.
The compiler requires an address for non-System entries, unique resolver IDs,
and at least one enabled Default resolver when any resolver is enabled.

Capability behavior is target-specific:

| Behavior | Mihomo | sing-box |
| --- | --- | --- |
| DoH / DoT / UDP | Supported | Supported |
| System resolver | Blocked by current lowering | Supported |
| Default role | Supported | Supported |
| Direct role | Mapped to `direct-nameserver` | Fails closed with `SINGBOX_DNS_ROLE_UNSUPPORTED` |
| Fallback role | Mapped to `fallback` | Fails closed with `SINGBOX_DNS_ROLE_UNSUPPORTED` |

Unsupported choices are not silently rewritten when the Primary Target changes.
Project data remains available so switching back restores the prior intent.

## Export

Export is a full Workspace page rather than a narrow Output inspector. It is
organized into:

1. Target selection;
2. target configuration;
3. compatibility for both production targets;
4. Preview and Export actions.

Only Mihomo and sing-box are actionable. Surge, Loon, Quantumult X,
Shadowrocket, and Stash are not presented as production exports. Target cards
show readiness, blocker codes, and node count without depending on a narrow
panel. Mihomo exposes its existing Local Proxy / Desktop TUN profile and related
network, DNS, and Advanced options. sing-box uses the compiler-supported default
configuration surface.

Mihomo and sing-box compiles are independent. The selected Primary Target
drives the final action, so a blocked secondary target does not disable a valid
Primary Target download. Download filenames and MIME types are generated by a
tested target export helper.

## Other Workspace Sections

Workspace projections continue to derive Sources, Proxies, Processing,
Strategies, Routing, DNS, Inspect issues, and Outputs from the same Project.
Presentation helpers provide source health, proxy filters, processing summaries,
strategy capability summaries, and Project Health grouping without adding data
to the Project schema.

Source URL refresh actions are local to Sources, including Refresh All. Inspect
uses stable diagnostic codes and links an issue back to its Graph node when a
location is available. Advanced Chain, raw matcher, Rule Set, Geo, ASN, target
options, and Universal IR details remain available through advanced editors.

## Visual Flow

Visual Flow remains lazy-loaded and uses the same semantic tokens as Workspace.
Its module palette can collapse to a rail, node surfaces are neutral, selection
uses Primary Blue, and warning/error colors are reserved for actual status.
Path dimming keeps unrelated nodes readable. Desktop uses an in-layout
inspector; narrower screens use an overlay or full-screen inspector.

The status bar is view-aware: graph counts, zoom, and fit belong to Visual Flow;
Workspace emphasizes Project health and local save state.

## Responsive And Accessibility Behavior

- Desktop (`>=1200px`): persistent Project navigation, main page, optional
  non-modal inspector.
- Medium (`768-1199px`): compact navigation, overlay inspector, wrapping target
  and Export content.
- Mobile (`<=767px`, including `390px`): single-column Workspace, compact page
  selector, full-screen editor, and `44px` touch targets.

Focus uses a visible blue ring. Icon-only buttons have accessible labels and
tooltips. Routing reorder does not depend on drag. Status and destructive
actions use text or icons as well as color. Reduced-motion preferences disable
non-essential transitions.

## Data And Runtime Boundaries

- Project Schema: `2` (unchanged; DNS fields are optional and additive).
- Runtime Storage Schema: `1` (unchanged).
- Runtime Service remains optional and does not own Project semantics.
- Runtime snapshots and subscription credentials remain outside Project export.
- Last Known Good remains active when a refresh fails.
- Mihomo and sing-box remain the only production output targets.

## Verification Gate

UI 2.0 is ready for user acceptance only after all of the following are
recorded against the final branch state:

- focused tests for Routing, DNS, Export, Workspace/Visual Flow, Project
  persistence, and target fail-closed behavior;
- three consecutive full `npm test` passes;
- `npm run build` and `npm run runtime:build`;
- `git diff --check`, scope review, and secret review;
- browser QA in Chinese and English at desktop, medium, and `390px` widths;
- cold reload with no new browser errors, warnings, failed assets, or favicon
  failures;
- Workspace edit -> Visual Flow -> Workspace -> reload consistency;
- recorded initial and lazy chunk sizes.

Until those final gates are recorded, this document describes the implemented
UI 2.0 contract and its acceptance target, not a formal release declaration.

## Explicit Non-Goals

UI 2.0 does not add a third compiler, accounts, cloud sync, payments, plugins,
AI generation, multi-user collaboration, a native mobile app, or a public CORS
proxy. Dark Mode is structurally possible through tokens but is not part of the
Light Mode acceptance gate.

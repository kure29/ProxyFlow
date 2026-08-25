# Loon Release Candidate Readiness Audit

Audit date: 2026-08-25
Repository: `kure29/ProxyFlow`
Audited branch: `feat/loon-product-exposure`
Audited baseline: `3c29711962cd5d1b38dc19a8c06cb7b51f659fcb` (`origin/main`)
Product version: `1.1.0`

This readiness record documents the completed product-exposure change. It does
not change compiler semantics, the Project or Universal IR schema, the version,
or any historical acceptance result. The pinned official Loon evidence used
by the foundation is LoonManual commit
[`4311d0030fe3065d4664b403a32010f083b99273`](https://github.com/Loon0x00/LoonManual/commit/4311d0030fe3065d4664b403a32010f083b99273).

## 1. Executive summary

**Decision: READY FOR PRODUCT EXPOSURE (evidence-bounded).**

The independent Loon backend is materially ready as an evidence-bounded
compiler foundation. It has deterministic IR lowering,
conservative serialization, explicit compatibility diagnostics, and real-client
evidence for the audited materialized subset. Product exposure does not expand
that accepted evidence boundary.

The product-path blockers are now addressed end to end. Loon is selectable
through the ordinary target registry, can be created and switched as a normal
Project, appears in Preview and Workspace Export, and uses a correctly
identified current-result artifact. The exposure is deliberately evidence
bounded: unsupported or unproven Loon intent still fails closed instead of
being presented as equivalent.

The compiler's unsupported protocol, DNS, routing, remote-source, and serializer
cases fail closed. Those are accepted limitations or deferred scope when the
product surface clearly reports the blocker and prevents export; they are not,
by themselves, reasons to broaden the Foundation allowlist.

## 1a. Paused integration follow-up (2026-08-25)

At this earlier paused stage, the lifecycle blocker was addressed internally
without changing the release decision. Loon was registered as a complete
`PrimaryTarget` with
`productStatus: 'paused'`, a central evidence-bounded capability profile, and a
lazy compiler-registry loader. Projects can be created by internal code,
resolved from explicit or legacy output metadata, persisted, hydrated, switched,
and undone/redone without graph loss. The compile hook also maintains a real
Loon compiler state and uses that state for paused-target health diagnostics.

At that stage `PRODUCT_TARGETS` remained exactly Mihomo and Surge, so Loon was
absent from ordinary New Project and target switching. Preview/export
integration remained a separate follow-up; no schema or version change was
made.

## 1b. Paused preview/export follow-up (2026-08-25)

At the second paused stage, the internal Preview and Export path was
implemented without changing the public decision. An explicitly loaded Loon
Project selected `loonState` for Preview and Workspace Export, rendered the real
Loon profile content, and used
the evidence-bounded `.conf` artifact metadata (`text/plain;charset=utf-8`,
INI). Loon remained visible only as an internal current-target state/banner;
ordinary target cards still iterated `PRODUCT_TARGETS`.

`useTargetCompile` hid stored results as soon as any compile request
identity changes (IR, target, options, or enabled state), while its cancellation
guard still prevented late asynchronous results from replacing a newer request.
Failed, empty, disabled, missing-input, and loading states therefore cannot
produce a stale Preview/Export artifact. Loon diagnostic presentations then
separate unsupported intent, unproven equivalence, routing-order uncertainty,
service-policy conflicts, and unproven rule/remote-source formats while keeping
technical codes and Locate behavior intact.

This was an internal safety gate before product exposure; the repository
version/schema remain 1.1.0/V2.

## 1c. Product exposure and CI hardening (2026-08-25)

The product gate is now complete. Loon is a supported `PrimaryTarget` and
`PRODUCT_TARGETS` is exactly Mihomo, Surge, and Loon; sing-box remains a
registered paused target and is not publicly exposed. Mihomo remains the
`DEFAULT_PRODUCT_TARGET`.

New Project, ordinary Target Switch, Preview, Workspace Export, and Project
Health all use the central product registry. Loon Preview and Export continue to
use `loonState` and the accepted `.conf` / INI / `text/plain;charset=utf-8`
artifact contract. The paused/internal-only Loon cards and paused Preview copy
were removed or gated by actual product status, so Loon is rendered once in
each ordinary target list.

The CI verify job now runs base, Service Rules, and routing-precedence Loon
acceptance, then checks `git diff --exit-code -- fixtures/loon` so both the
top-level and nested precedence fixtures cannot drift. No compiler semantics,
allowlists, schema, Runtime, version, or mutable owned rule URL policy changed.

## 2. Current accepted baseline

| Item | Accepted fact | Evidence |
| --- | --- | --- |
| Product target status | Mihomo, Surge, and Loon are officially exposed; Loon remains evidence-bounded. sing-box is registered but paused and hidden. | [`src/core/capabilities/targetCapabilities.ts`](../src/core/capabilities/targetCapabilities.ts), [`src/data/demoProject.ts`](../src/data/demoProject.ts) |
| Loon client | Loon `3.5.0 (975)`; iOS version was not recorded. | [`docs/loon-acceptance.md`](loon-acceptance.md#L234-L247) |
| Real subscription | 95 candidates, 91 compatible, 4 intentionally skipped, 0 blockers. Skips were 2 SS2022 AES-256 and 2 VLESS Reality. | [`docs/loon-acceptance.md`](loon-acceptance.md#L216-L232) |
| Core client result | Real import and real proxy traffic passed. | [`docs/loon-acceptance.md`](loon-acceptance.md#L234-L247) |
| Service Rules | Foundation and deterministic generation passed. OpenAI recognition, fetch/refresh, policy binding, traffic, and `FINAL -> DIRECT` passed on the real client. The other nine services have deterministic/semantic parity only. | [`docs/loon-compiler.md`](loon-compiler.md#L16-L45), [`docs/loon-acceptance.md`](loon-acceptance.md#L324-L355) |
| Routing evidence | Controlled local-vs-Remote result is `LOCAL_FIRST`; controlled Google/Gemini Remote-vs-Remote result is `FIRST_SUBSCRIPTION_WINS`. These results are narrow and do not generalize. | [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md#L52-L91) |
| Production routing boundary | Domain-family Local-before-Remote is conditional; Remote-before-local, IP-family local plus Remote, mixed domain/IP families, and generalized different-policy Remote-vs-Remote remain fail-closed. | [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md#L110-L141), [`src/targets/loon/compatibility.ts`](../src/targets/loon/compatibility.ts#L122-L237) |

## 3. Product exposure safety gates

The following gates define the evidence-bounded ordinary product path:

1. A complete central capability profile and lazy compiler-registry loader must
   agree on the target id, version, status, capabilities, and ordering.
2. New Project, hydration, persistence, target switching, and undo/redo must
   carry one consistent Loon `primaryTarget` and output client.
3. Preview and export must invoke the Loon compiler, label its syntax, and bind
   artifact identity to the current graph/result generation.
4. Incompatible or unproven intent must be visible and actionable in the UI;
   no fallback to Mihomo may make a Loon Project appear valid.
5. CI must protect the checked-in Loon acceptance and precedence evidence with
   deterministic scripts and fixture drift checks.

These exposure safety gates are addressed in this PR. Optional native protocols
and broader real-client coverage remain separate, explicitly documented work.

## 4. Target Registry audit

### Observed path

- [`PRIMARY_TARGETS`](../src/core/capabilities/targetCapabilities.ts#L6-L10)
  contains `mihomo`, `surge`, `sing-box`, and `loon`; `PRODUCT_TARGETS` filters
  the central profiles whose `productStatus` is `supported`.
- The central `targetCapabilityRegistry` now has a complete supported `loon` key.
  Its profile is deliberately conservative: unproven protocol, routing,
  rule-source, DNS, chain, and remote-source cases remain `partial` or
  `unsupported` with the existing Loon diagnostics.
- `TargetClient` includes `loon`, but this wider output union is not a product
  registry ([`src/types/output.ts`](../src/types/output.ts#L1-L8)).
- `outputDefinitions` and `productionOutputDefinitions` include Loon as a
  supported output ([`src/data/demoProject.ts`](../src/data/demoProject.ts#L25-L35)).
- The compiler registry lazily registers Mihomo, sing-box, Surge, and the
  internal Loon compiler ([`src/core/compiler/index.ts`](../src/core/compiler/index.ts#L1-L23)).
- The target-local matrix in [`src/targets/loon/capabilities.ts`](../src/targets/loon/capabilities.ts#L18-L44)
  is intentionally separate from product exposure.

### Finding

**Finding: ADDRESSED.** Loon is supported in the central product registry,
appears in `PRODUCT_TARGETS` in ordinary order, and continues to use the same
lazy compiler and conservative capability matrix.

## 5. New Project audit

`NewProjectDialog` iterates `PRODUCT_TARGETS` and initializes its selection to
Mihomo ([`src/components/workspace/NewProjectDialog.tsx`](../src/components/workspace/NewProjectDialog.tsx#L22-L43),
[`#L116-L147`](../src/components/workspace/NewProjectDialog.tsx#L116-L147)).
`createBlankProject` accepts every registered `PrimaryTarget`, resolves labels
from the central registry, and keeps Mihomo-only DNS/profile defaults
([`src/data/newProject.ts`](../src/data/newProject.ts#L7-L27),
[`#L56-L69`](../src/data/newProject.ts#L56-L69)). Internal Loon projects are
therefore structurally valid while the ordinary picker now offers Mihomo, Surge,
and Loon.

`resolveProjectPrimaryTarget` accepts registered `isPrimaryTarget` values,
including explicit and legacy Loon metadata, while unknown values remain
`invalid-metadata`/`unsupported-output` ([`src/core/project/primaryTarget.ts`](../src/core/project/primaryTarget.ts#L12-L25),
[`src/core/project/primaryTarget.test.ts`](../src/core/project/primaryTarget.test.ts#L18-L82)).
Hydration deliberately preserves the graph while nulling corrupted target
metadata ([`src/store/useBuilderStore.test.ts`](../src/store/useBuilderStore.test.ts#L391-L398)).
The project index still returns a stored `primaryTarget` without validating it
([`src/storage/projectStorage.ts`](../src/storage/projectStorage.ts#L90-L107));
the project overview now guards that list value with `isPrimaryTarget` and shows
the existing target-required recovery label for unknown metadata
([`src/components/workspace/ProjectOverview.tsx`](../src/components/workspace/ProjectOverview.tsx#L161-L168)).
Hydration continues to normalize unknown metadata to the explicit recovery path
without rewriting the graph.

**Product exposure answer: ADDRESSED.** The existing schema remains sufficient
(`PROJECT_SCHEMA_VERSION = 2`), Mihomo remains the default, and Loon is now
offered by the ordinary picker without rewriting lifecycle logic.

## 6. Target Switch audit

`TargetSwitchDialog` and the export target cards iterate `PRODUCT_TARGETS`
([`src/components/workspace/WorkspaceTargets.tsx`](../src/components/workspace/WorkspaceTargets.tsx#L32-L90),
[`#L148-L167`](../src/components/workspace/WorkspaceTargets.tsx#L148-L167)).
`setPrimaryTarget` updates a sole output and records history non-destructively,
using central labels for all registered targets
([`src/store/useBuilderStore.ts`](../src/store/useBuilderStore.ts#L601-L620)).
The Mihomo ↔ Surge path preserves graph, edges, target-native profile, and
undo/redo ([`src/store/useBuilderStore.test.ts`](../src/store/useBuilderStore.test.ts#L450-L507)).

The internal `setOutputClient` path now recognizes Loon through the central
target registry, and a sole output edit synchronizes `primaryTarget`. Compile
selection has a dedicated Loon state; only ordinary product selection continues
to fall back to the default product target for non-product metadata
([`src/components/compiler/useProjectCompiles.ts`](../src/components/compiler/useProjectCompiles.ts#L19-L57),
[`src/core/capabilities/targetCapabilities.ts`](../src/core/capabilities/targetCapabilities.ts#L345-L351)).

**Finding: ADDRESSED.** Target Switch now offers Mihomo, Surge, and Loon through
the normal registry path. Loon transitions retain target identity and compiler
state without the historical paused-target fallback or duplicate card.

## 7. Preview audit

`PreviewMode` now includes `loon`, with metadata derived from the supported
product registry in [`PreviewModal.tsx`](../src/components/preview/PreviewModal.tsx).
Ordinary Mihomo, Surge, and Loon previews expose the same supported compiler
choices; sing-box remains absent. The hook requests `loonState` and validates
with `loon`, so a Loon target cannot fall back to Mihomo.

For every target, graph/compile errors produce an issue log, and copy/download
are disabled unless the current mode reports compile success. Loon uses the
same plain-text code panel and an explicit `Export Loon .conf` action. The
paused warning remains available only for genuinely paused targets.

**Finding: ADDRESSED.** Loon resolves normally in Preview, and supported Loon
does not display paused-product copy. Existing blocked-preview and stale-result
gates remain intact.

## 8. Export audit

`targetFileMeta` now includes Loon as `.conf`, `text/plain;charset=utf-8`, and
INI format. `buildTargetExportArtifact` rejects failed or empty results, and
Workspace Export uses the Loon state/result identity instead of resolving Loon
to Mihomo. The ordinary target cards iterate `PRODUCT_TARGETS` once, without an
internal duplicate Loon card.

`useTargetCompile` now assigns a request identity to IR, target, options, and
enabled state. A transition immediately hides stored results, including when a
target changes from Mihomo to Loon or when compilation is disabled/missing.
Effect cancellation still prevents an older asynchronous request from
overwriting a newer one.

**Finding: ADDRESSED.** Loon is an ordinary export target with the existing
`.conf` / `text/plain;charset=utf-8` / INI contract. Failed, empty, disabled,
and stale-result gates remain unchanged.

## 9. Compatibility UX audit

`DiagnosticPresentationList` exposes a human title, description, impact, action,
technical details, and an optional locate-node action. Loon codes now receive
centralized localized presentations in
[`diagnosticPresentation.ts`](../src/components/compiler/diagnosticPresentation.ts):
unsupported protocol/variant/DNS/strategy intent is distinct from unproven
equivalence; routing order, service-policy conflict, rule-source format, and
remote proxy-source format have dedicated explanations.
The exact code and compiler message are present only in collapsed Technical
details. Node location works only when an issue entity/node id matches a real
graph node ([`src/core/compiler/diagnostics.ts`](../src/core/compiler/diagnostics.ts#L15-L19)).

Technical codes, severity, entity/node identity, and Locate behavior remain in
the collapsed technical details and location mapping. The UI therefore explains
why an evidence boundary blocks export without hiding the stable compiler code.

**Status: ADDRESSED.** This does not widen any compiler allowlist; non-blocking
Loon warning/info diagnostics remain non-blocking after exposure.

## 10. Capability matrix audit

The following matrix distinguishes Loon-native syntax, Universal IR fields, and
the current ProxyFlow Loon lowering. A conditional row means only the listed
lossless subset is accepted.

### Proxy protocols

| Protocol / variant | ProxyFlow Loon decision | Status | Evidence / blocker |
| --- | --- | --- | --- |
| HTTP bare | Bare HTTP and exact credential subset lower directly. | SUPPORTED | [`proxies.ts`](../src/targets/loon/proxies.ts#L58-L61), [`#L94-L105`](../src/targets/loon/proxies.ts#L94-L105); pinned node syntax. |
| HTTPS | HTTP IR plus ordinary enabled TLS, SNI, and certificate intent only. | CONDITIONAL | `LOON_PROXY_TLS_VARIANT_UNSUPPORTED`; no silent Reality/fingerprint/disable-SNI mapping ([`proxies.ts`](../src/targets/loon/proxies.ts#L260-L291)). |
| Shadowsocks | Exact cipher allowlist: `aes-128-gcm`, `chacha20`, `2022-blake3-aes-128-gcm`; fixed quoted password. | CONDITIONAL | [`LOON_SHADOWSOCKS_CIPHERS`](../src/targets/loon/proxies.ts#L7-L20); unlisted values fail `LOON_PROXY_CIPHER_UNSUPPORTED`. |
| Shadowsocks simple-obfs | Canonical `simple-obfs`, explicit `obfs=http|tls`/`obfs-name`, host, optional URI only when represented. | CONDITIONAL | [`proxies.ts`](../src/targets/loon/proxies.ts#L198-L208); aliases/plugins fail closed. |
| SS2022 AES-128 | The exact `2022-blake3-aes-128-gcm` value is in the allowlist. | CONDITIONAL | No broader SS2022 key-role/length model exists in Universal IR. |
| SS2022 AES-256 | No accepted Loon evidence/IR-preserving lowering in this foundation. | UNSUPPORTED / DEFERRED | `LOON_PROXY_CIPHER_UNSUPPORTED`; two real-subscription candidates were intentionally skipped. |
| Trojan | TLS required; TCP/WS/plain HTTP subset; exact password/SNI/ALPN limits. | CONDITIONAL | [`proxies.ts`](../src/targets/loon/proxies.ts#L210-L218). |
| VMess | `security=aes-128-gcm`, explicit integer `alterId` (including 0), TCP/WS/HTTP only. | CONDITIONAL | [`LOON_VMESS_SECURITY`](../src/targets/loon/proxies.ts#L22-L27), [`#L220-L231`](../src/targets/loon/proxies.ts#L220-L231). |
| VLESS ordinary | Basic TCP/WS/HTTP and ordinary TLS only. | CONDITIONAL | [`proxies.ts`](../src/targets/loon/proxies.ts#L233-L246). |
| VLESS Reality | Native syntax exists, but Universal-to-Loon field parity/lowering is not proven. | DEFERRED | `LOON_VLESS_VARIANT_UNSUPPORTED`; two accepted-subscription skips. |
| Vision / `flow` | Not emitted or inferred. | DEFERRED | Same VLESS variant blocker; no silent downgrade. |
| Hysteria2 | Minimal password/TLS/SNI subset; no obfs, bandwidth, or hopping. | CONDITIONAL | [`proxies.ts`](../src/targets/loon/proxies.ts#L248-L258). |
| SOCKS5 | Native syntax may exist, but exact Universal lowering and client acceptance are not complete. | DEFERRED | `LOON_PROXY_PROTOCOL_UNSUPPORTED`. |
| AnyTLS | Native page evidence is not an IR/lowering proof. | DEFERRED | `LOON_PROXY_PROTOCOL_UNSUPPORTED`. |
| TUIC | No exact audited mapping in this foundation. | DEFERRED | `LOON_PROXY_PROTOCOL_UNSUPPORTED`. |
| SSR, WireGuard, custom JS | Native forms do not have corresponding Universal endpoint/script models. | UNMODELED / DEFERRED | Do not coerce into another protocol. |

### Strategy groups

| Strategy | Decision | Status | Boundary |
| --- | --- | --- | --- |
| Select | Ordered members and nested references when resolved. | SUPPORTED / CONDITIONAL for nesting | Missing references/cycles block. |
| URL Test / auto-select | URL, interval, and tolerance subset with valid group-scoped members. | SUPPORTED | Invalid health fields block. |
| Fallback | URL/interval can lower; Universal tolerance cannot be represented as Loon `max-timeout`. | CONDITIONAL | `LOON_FALLBACK_TOLERANCE_UNSUPPORTED`. |
| Fixed | One resolved endpoint lowers to a single-member select policy. | SUPPORTED | Unresolved endpoint blocks. |
| Load-balance Round-Robin | Explicit ordered Round-Robin syntax is emitted. | SUPPORTED | This proves representation, not statistical/PCC/failover equivalence. |
| Load-balance PCC/consistent-hash | Hostname stickiness and Universal hash semantics are not equivalent by assumption. | UNSUPPORTED | `LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED`. |
| Proxy Chain | No proven native chain lowering; active chain blocks, inactive chain can be omitted with warning. | UNPROVEN | `LOON_PROXY_CHAIN_UNPROVEN`. |

## 11. Routing / Service Rules UX audit

### Routing matrix

| Matcher / combination | Current behavior | Classification |
| --- | --- | --- |
| `domain`, `domain-suffix`, `domain-keyword` only | Preserve Universal priority and serialize the domain family. | Conditional supported subset |
| `ip-cidr`, `ip-cidr6`, `geo-ip` only | Preserve Universal priority and serialize the IP family. | Conditional supported subset |
| Active mixed domain + IP families | One `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`; no reorder, domain-first, or IP-first guess. | ACCEPTED LIMITATION |
| `FINAL` | Remains valid and is emitted as the fallback rule. | READY / NO ACTION |
| Domain local + owned first-party Remote | Allowed only when every potentially overlapping local domain route precedes Remote under Universal order and proven `LOCAL_FIRST`. | Conditional |
| Remote-before-domain-local | Fails closed as `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNSUPPORTED`. | ACCEPTED LIMITATION |
| Active IP local + opaque first-party Remote | Fails closed as `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`; matcher-family precedence is not proven. | ACCEPTED LIMITATION |
| Same-policy multiple owned Remote Rules | May serialize when URLs resolve and effective policies agree. | Conditional |
| Different-policy Remote-vs-Remote | Fails closed as `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`; the Google/Gemini result is not generalized. | DEFERRED |
| Same-service conflicting policies | Fails closed as `LOON_SERVICE_RULE_POLICY_CONFLICT`. | ACCEPTED LIMITATION |
| Arbitrary `rule-set`, port, ASN/no-resolve, geo-site, other matcher | No lossless source/matcher model; fail closed with the relevant diagnostic. | DEFERRED |

The implementation is intentionally simple: route ordering is checked in
[`compatibility.ts`](../src/targets/loon/compatibility.ts#L218-L245) and emitted by
[`routing.ts`](../src/targets/loon/routing.ts#L1-L180) without semantic guessing.
The focused tests cover pure-family ordering, mixed-family blocking, `FINAL`,
Remote-before-local, and IP-local-plus-Remote
([`src/targets/loon/precedence.e2e.test.ts`](../src/targets/loon/precedence.e2e.test.ts#L49-L125)).

### First-party Service Rules

`src/data/serviceRuleAssets.ts` registers exactly ten Loon assets: OpenAI,
Claude, Google, Gemini, YouTube, Netflix, Disney, Telegram, GitHub, and Steam
([lines 1-17](../src/data/serviceRuleAssets.ts#L1-L17)). China Mainland is absent
and must remain absent. The resolver accepts only a catalog service with an
owned Loon asset and rejects missing, legacy-China, or arbitrary sources
([`src/targets/loon/serviceRules.ts`](../src/targets/loon/serviceRules.ts#L7-L36)).

| Service | Catalog | Owned Loon URL | Deterministic generation/parity | Real-client evidence |
| --- | --- | --- | --- | --- |
| OpenAI | Yes | Yes | Yes | **Yes**: import, recognition, fetch/refresh, policy binding, traffic |
| Claude | Yes | Yes | Yes | No; semantic/deterministic only |
| Google | Yes | Yes | Yes | No; semantic/deterministic only |
| Gemini | Yes | Yes | Yes | No; semantic/deterministic only |
| YouTube | Yes | Yes | Yes | No; semantic/deterministic only |
| Netflix | Yes | Yes | Yes | No; semantic/deterministic only |
| Disney | Yes | Yes | Yes | No; semantic/deterministic only |
| Telegram | Yes | Yes | Yes | No; semantic/deterministic only |
| GitHub | Yes | Yes | Yes | No; semantic/deterministic only |
| Steam | Yes | Yes | Yes | No; semantic/deterministic only |

The URLs currently point at the mutable `main` branch of the owned rules
repository ([`serviceRuleAssets.ts`](../src/data/serviceRuleAssets.ts#L1-L14)).
That is an auditable supply-chain/determinism improvement for a follow-up, not a
reason to copy Surge URLs or infer a generic Loon service format. The pinned
LoonManual/sub-rule evidence proves URL-plus-policy syntax only; it does not
prove arbitrary list grammar, HTTP headers/method/authentication, refresh
scheduling, cache persistence, or failure semantics. Keep
`LOON_RULE_SOURCE_FORMAT_UNPROVEN` and the native Remote Proxy Source boundary
until those are independently evidenced.

## 12. Representative end-to-end scenario audit

| Scenario | Result | Evidence and interpretation |
| --- | --- | --- |
| Subscription → manual strategy → `FINAL` → Loon | **COMPILABLE** | Sanitized acceptance fixture passes graph/IR/compatibility/serializer; `compileLoon` emits a deterministic profile. |
| Nodes → Select/URL Test/Fixed/Round-Robin → local domain routes → `FINAL` | **COMPILABLE** for the listed supported subsets | `fixtures/loon/acceptance-project.json` and compiler tests cover these strategies; fallback tolerance, PCC, chain, and unsupported members remain blocked. |
| Local domain route → OpenAI Service Rule → `FINAL` | **COMPILABLE** only when local route precedes Remote | [`precedence.e2e.test.ts`](../src/targets/loon/precedence.e2e.test.ts#L49-L62) and real OpenAI evidence prove the conditional local-first path. |
| Different-policy Remote Rules (for example, generalized Google/Gemini overlap) | **BLOCKED SAFELY** | `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`; the controlled order result is intentionally not generalized. |
| Unsupported/deferred protocol (for example, VLESS Reality or SS2022 AES-256) | **BLOCKED SAFELY** | `compileLoon` returns `success: false`, empty content, and diagnostics; [`compiler.ts`](../src/targets/loon/compiler.ts#L18-L74) has the fail-closed gate. |

Inactive inventory is isolated from active collision checks, and a partially
compatible replaceable pool may continue while compatible members remain. An
all-incompatible active pool or incompatible Fixed endpoint is a blocker; no
endpoint is silently rewritten.

## 13. Security, privacy, and deterministic export audit

- `compileLoon` stops before lowering/serialization when IR or compatibility has
  an error and returns `content: ''` ([`src/targets/loon/compiler.ts`](../src/targets/loon/compiler.ts#L18-L74)).
- The serializer emits five fixed sections, LF line endings, and exactly one
  trailing newline ([`src/targets/loon/serializer.ts`](../src/targets/loon/serializer.ts#L11-L20)).
- Raw tokens reject delimiters, comments, quotes, backslashes, controls, and
  unsafe whitespace. Fixed quoted literals are limited to explicitly proven
  fields; there is no invented CSV-like or backslash escape grammar
  ([`serializer.ts`](../src/targets/loon/serializer.ts#L87-L174)).
- Policy/group names may use syntax-safe Unicode (including CJK/emoji) but reject
  delimiters, comments, controls, line separators, unpaired surrogates, outer
  whitespace, duplicates, and built-in collisions
  ([`serializer.ts`](../src/targets/loon/serializer.ts#L126-L185),
  [`compatibility.ts`](../src/targets/loon/compatibility.ts#L301-L308)).
- Existing export tests prove failed/empty results do not produce artifacts. The
  current-result/stale-result gate in section 8 remains active for every exposed
  target, including Loon.
- No private subscription, credential, screenshot, or forbidden temporary file
  was read for this audit. Acceptance evidence is aggregate/textual only.
- Remote service URLs are owned but mutable on `main`; the URL policy is
  unchanged in this PR. Immutable pinning versus independent rule updates is a
  deferred cross-target supply-chain design decision, not a silent Loon change.

## 14. Deployment / CI audit

`.github/workflows/ci.yml` runs `npm ci`, the full test suite, client build,
runtime build, deployment tests, base/service-rule/precedence Loon acceptance,
the complete `fixtures/loon` drift check, and Docker Compose validation
([`ci.yml`](../.github/workflows/ci.yml#L19-L31)).
`.github/workflows/container.yml` runs the general test/build/deployment path but
does not run Loon acceptance ([`container.yml`](../.github/workflows/container.yml#L24-L32)).

The verify job now runs both deterministic acceptance scripts explicitly after
the base acceptance and checks `git diff --exit-code -- fixtures/loon`. This
covers the top-level golden files and the nested precedence fixtures while
keeping real-client evidence as a separately recorded/manual acceptance axis.

### Verification run for this audit

The following commands were run from the clean exposure branch. All exited
successfully:

| Command | Result |
| --- | --- |
| `npm test -- --run` | 107 test files, 1121 tests passed |
| `npm run test:deployment` | 40/40 deployment tests passed |
| `npm run build` | Passed; Vite client build completed |
| `npm run runtime:build` | Passed; Runtime bundle completed |
| `npx tsc -b --pretty false` | Passed with no output |
| `npm run loon:acceptance` | Passed; 11 sanitized candidates, 0 blockers; fixture generated |
| `npm run loon:service-rules:acceptance` | Passed; one OpenAI Remote Rule; fixture generated |
| `npm run loon:precedence:acceptance` | Passed; four profiles; no private data required |
| `git diff --check` | Passed |

Acceptance scripts wrote only their existing ignored/generated artifacts. No
private subscription or credential file was opened.

## 15. Release blocker matrix

| Area | Current Status | Evidence | User Impact | Classification | Required Action |
| --- | --- | --- | --- | --- | --- |
| Target Registry / compiler registration | Loon is a complete central supported profile with a lazy compiler loader; `PRODUCT_TARGETS` is Mihomo, Surge, Loon. | [`targetCapabilities.ts`](../src/core/capabilities/targetCapabilities.ts#L6-L53), [`compiler/index.ts`](../src/core/compiler/index.ts#L1-L23), registry test. | Ordinary product paths select Loon while deferred capabilities remain fail-closed. | ADDRESSED | Keep the central status/order and conservative capability matrix. |
| New Project / persistence plumbing | Creation, resolver, storage round-trip, hydration, unknown-target recovery, and overview rendering handle registered Loon safely. | [`NewProjectDialog.tsx`](../src/components/workspace/NewProjectDialog.tsx#L22-L43), [`newProject.ts`](../src/data/newProject.ts#L7-L69), [`primaryTarget.ts`](../src/core/project/primaryTarget.ts#L12-L25), [`projectStorage.ts`](../src/storage/projectStorage.ts#L90-L107), [`ProjectOverview.tsx`](../src/components/workspace/ProjectOverview.tsx#L161-L168). | Loon is selectable without graph loss; Mihomo remains the default. | ADDRESSED | Preserve the existing schema and recovery behavior. |
| Target Switch / state consistency | Ordinary target switching, low-level output edits, compiler state selection, hydration, and undo/redo keep registered target metadata synchronized. | [`WorkspaceTargets.tsx`](../src/components/workspace/WorkspaceTargets.tsx#L32-L90), [`useBuilderStore.ts`](../src/store/useBuilderStore.ts#L450-L463), [`#L597-L620`](../src/store/useBuilderStore.ts#L597-L620). | Mihomo ↔ Surge ↔ Loon transitions retain target identity and do not duplicate cards. | ADDRESSED | Keep paused-target messaging for sing-box only. |
| Preview pipeline | Preview derives visible compiler modes from supported product targets and includes real `loonState`; sing-box remains hidden. | [`PreviewModal.tsx`](../src/components/preview/PreviewModal.tsx), [`useProjectCompiles.ts`](../src/components/compiler/useProjectCompiles.ts#L32-L61). | Loon Preview resolves normally without paused-product copy or Mihomo fallback. | ADDRESSED | Preserve current-result and blocked-preview gates. |
| Export metadata and current-result gate | Loon uses `.conf`/`text/plain;charset=utf-8`/INI metadata; request identity hides stale IR/target/options/enabled results and async cancellation prevents late overwrite. | [`exportFile.ts`](../src/components/compiler/exportFile.ts), [`useTargetCompile.ts`](../src/components/compiler/useTargetCompile.ts), export panel. | Public Loon copy/download cannot expose a previous target’s successful artifact during a transition. | ADDRESSED | Preserve failed/empty rejection and current-request identity. |
| Compatibility UX | Loon presentations distinguish unsupported and unproven behavior, routing order, service-policy conflict, rule-source format, and remote proxy-source format while retaining technical details and Locate. | [`diagnosticPresentation.ts`](../src/components/compiler/diagnosticPresentation.ts), [`DiagnosticPresentationList.tsx`](../src/components/compiler/DiagnosticPresentationList.tsx). | Evidence boundaries are actionable without hiding stable compiler codes. | ADDRESSED | Keep centralized i18n mapping; do not widen compiler allowlists. |
| CI acceptance coverage | CI runs base, service-rules, and precedence acceptance, then checks all tracked `fixtures/loon` output for drift. | [`ci.yml`](../.github/workflows/ci.yml#L19-L31); package scripts. | Regressions in the newest evidence boundaries are covered by the exposure gate. | ADDRESSED | Keep the deterministic checks and separate real-client evidence. |
| First-party Service Rule client breadth | Ten assets have deterministic parity; only OpenAI has real-client acceptance. | [`serviceRuleAssets.ts`](../src/data/serviceRuleAssets.ts#L1-L17), [`loon-acceptance.md`](loon-acceptance.md#L324-L355). | Other services could differ in client matching/refresh behavior despite valid generated bytes. | DEFERRED | Broader sanitized real-client acceptance is valuable follow-up evidence; do not claim all ten today. |
| Mutable owned rule URLs | Asset URLs use the rules repository `main` branch. | [`serviceRuleAssets.ts`](../src/data/serviceRuleAssets.ts#L1-L14). | A later upstream change can alter a fetched production rule list without a ProxyFlow release. | DEFERRED | Cross-target supply-chain design follow-up: decide a shared immutable asset/update policy and verify generated content hashes; do not silently pin Loon-only URLs here. |
| Supported protocol subset | HTTP and selected conditional protocols compile; unsupported variants fail with explicit diagnostics. | [`proxies.ts`](../src/targets/loon/proxies.ts#L34-L91), [`compiler.ts`](../src/targets/loon/compiler.ts#L64-L74). | Users cannot use optional variants, but no silent downgrade occurs. | ACCEPTED LIMITATION | Document the exact subset and keep blocked export behavior. |
| Strategy semantics | Select/URL Test/Fixed/Round-Robin subset works; fallback tolerance, PCC, and active chains block. | [`compatibility.ts`](../src/targets/loon/compatibility.ts#L253-L299), strategy tests. | Some strategy intents cannot be exported. | ACCEPTED LIMITATION | Keep fail-closed diagnostics; do not claim statistical or failover equivalence. |
| Domain/IP and Local/Remote precedence | Pure families preserve Universal order; mixed families, IP+Remote, and Remote-before-local block. | [`compatibility.ts`](../src/targets/loon/compatibility.ts#L122-L237), precedence tests/docs. | Some route graphs cannot compile; accepted graphs cannot silently reorder. | ACCEPTED LIMITATION | Preserve guards and expose the conditional rule in UX/docs. |
| Serializer grammar | Conservative raw-token/fixed-quoted grammar; delimiter-sensitive or unproven values fail closed. | [`serializer.ts`](../src/targets/loon/serializer.ts#L87-L174), serializer tests. | Some credentials/values are rejected instead of guessed. | ACCEPTED LIMITATION | Retain the proven grammar; only widen after pinned parser/client evidence. |
| DNS lowering | System, safe bare IPv4 UDP, and pure DoH subsets; DoT, roles, mixed semantics, and unmodeled forms block. | [`src/targets/loon/dns.ts`](../src/targets/loon/dns.ts#L18-L94), DNS tests. | Advanced DNS intent is unavailable, with no silent downgrade. | ACCEPTED LIMITATION | Keep explicit diagnostics and document the supported subset. |
| Arbitrary rule sets / native Remote Proxy Source | URL-plus-policy syntax is known, but arbitrary list grammar, HTTP behavior, refresh/cache/failure semantics are not proven. | [`docs/loon-compiler.md`](loon-compiler.md#L320-L365), `LOON_RULE_SOURCE_FORMAT_UNPROVEN` and `LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`. | User-provided remote sources remain unavailable; copying Surge format would be unsafe. | DEFERRED | Require a checked-in artifact, deterministic generator, matcher-parity tests, and real-client import/update/failure evidence before implementation. |
| Generalized Remote-vs-Remote semantics | One controlled Google/Gemini pair shows first-subscription-wins; generalized different-policy overlap remains unproven. | [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md#L68-L121). | Broader conflicting remote combinations remain blocked. | DEFERRED | Gather new real-client fixtures before changing `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`. |
| Optional native protocol expansion | Reality/Vision/flow, SS2022 AES-256, SOCKS5, AnyTLS, TUIC, SSR, WireGuard, custom JS, and Proxy Chain are outside the current IR/lowering phase. | [`src/targets/loon/capabilities.ts`](../src/targets/loon/capabilities.ts#L19-L43), protocol tests. | Feature breadth is incomplete but blocked safely. | DEFERRED | Design a separate IR/evidence PR for each family; no coercion or silent fallback. |
| Existing fail-closed compiler/export behavior | Failed Loon compile returns empty content; target export rejects failed/empty results; inactive inventory and partial pools are isolated. | [`compiler.ts`](../src/targets/loon/compiler.ts#L27-L74), [`exportFile.ts`](../src/components/compiler/exportFile.ts#L18-L29), projection tests. | Supported Loon workflows do not emit partial configs. | READY / NO ACTION | Preserve these invariants. |
| Schema shape / version | `primaryTarget?: PrimaryTarget` and schema V2 already exist; no new field is inherently required for initial exposure. | [`src/types/project.ts`](../src/types/project.ts#L166-L178), [`src/core/project/version.ts`](../src/core/project/version.ts#L1-L15). | A target can reuse the existing shape once validation/registry plumbing is complete. | READY / NO ACTION | Avoid a speculative schema bump; add only evidenced target-specific settings. |

Matrix row counts: **MUST FIX BEFORE EXPOSURE 0**; **ADDRESSED 7**;
**SHOULD FIX BEFORE 1.2.0 0**; **ACCEPTED LIMITATION 5**; **DEFERRED 5**;
**READY / NO ACTION 2**.

## 16. Recommended implementation sequence

The staged work recorded by this audit is complete through product exposure.
The remaining items are evidence-bounded follow-ups and must not widen the
compiler without new proof.

### PR A — Loon product integration plumbing (completed)

- **Goal:** Add a complete central capability profile, product status/order,
  target metadata, and lazy compiler loader while keeping the feature flag
  developer-hidden.
- **Why:** Resolves the registry blocker and gives every surface one source of
  truth.
- **Out of scope:** No public exposure, protocol expansion, or schema bump by
  assumption.

### PR B — Project lifecycle and target-state integrity (completed)

- **Goal:** Extend New Project, hydration/resolution, persistence, target switch,
  target-specific defaults, output node synchronization, and undo/redo for Loon.
- **Why:** Resolves invalid-picker, fallback, and target-intent corruption risks.
- **Out of scope:** Do not rewrite graph semantics or coerce unsupported fields.

### PR C — Product exposure and CI hardening (this change)

- **Goal:** Enable Loon as a supported product target across New Project, Target
  Switch, Preview, Workspace Export, Project Health, and CI fixture checks.
- **Why:** Completes the ordinary product path while preserving the
  evidence-bounded compiler and current-result safety gates.
- **Status:** **ADDRESSED.** No widening of compiler allowlists.

### Follow-up — Evidence and supply-chain hardening

- **Goal:** Pin owned rule assets or hashes and add broader sanitized real-client
  Service Rule checks; CI acceptance and fixture drift protection are already
  addressed here.
- **Why:** Closes the remaining 1.2.0 evidence/supply-chain quality gaps.
- **Out of scope:** Do not claim all ten services are real-client proven until
  each result is recorded.

### Post-1.2.0 deferred work

Treat Reality/Vision/flow, SS2022 AES-256, SOCKS5/AnyTLS/TUIC, SSR/WireGuard/
custom JS, Proxy Chain, arbitrary remote lists, and generalized precedence as
separate evidence-and-IR projects rather than bundling them into exposure.

## 17. Explicit non-goals / deferred scope

This audit does not:

- widen the already-registered Loon compiler semantics, protocol allowlists, or
  public capability claims;
- change projection semantics, inactive inventory isolation, partial-pool skip
  behavior, `FINAL`, DNS boundaries, remote-source boundaries, Project schema,
  compiler registry behavior beyond product exposure, Mihomo, Surge, sing-box,
  Runtime, or version;
- modify or reinterpret [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md),
  its fixtures, generator, or acceptance implementation;
- implement Reality, Vision/flow, SS2022 AES-256, SOCKS5, AnyTLS, TUIC, SSR,
  WireGuard, custom JS, Proxy Chain, arbitrary rule-set sources, or generic
  serializer escaping;
- infer Loon capability from Mihomo, Surge, Shadowsocks convention, or community
  repositories; or copy Surge remote-rule URLs into a Loon format;
- claim real-client evidence for the nine non-OpenAI service assets;
- inspect private subscription/credential data or the forbidden temporary files.

**READY FOR PRODUCT EXPOSURE (evidence-bounded)**

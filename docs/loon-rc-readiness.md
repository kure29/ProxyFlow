# Loon Release Candidate Readiness Audit

Audit date: 2026-08-24
Repository: `kure29/ProxyFlow`
Audited branch: `audit/loon-rc-readiness`
Audited baseline: `b408f0f01855b86c1983d05d42c142793eac7275` (`origin/main`)
Product version: `1.1.0`

This is a documentation-only audit. It does not expose Loon, change compiler
semantics, change the Project or Universal IR schema, bump the version, or
reopen any historical acceptance result. The pinned official Loon evidence used
by the foundation is LoonManual commit
[`4311d0030fe3065d4664b403a32010f083b99273`](https://github.com/Loon0x00/LoonManual/commit/4311d0030fe3065d4664b403a32010f083b99273).

## 1. Executive summary

**Decision: NOT READY FOR PRODUCT EXPOSURE.**

The independent Loon backend is materially ready as a developer-only,
evidence-bounded compiler foundation. It has deterministic IR lowering,
conservative serialization, explicit compatibility diagnostics, and real-client
evidence for the audited materialized subset. The accepted baseline is not the
same thing as a user-selectable product target.

The release blockers are product-path blockers, not a request to implement every
Loon-native feature. Today a user cannot select Loon through the ordinary target
registry, create or switch a valid Loon Project, preview it through the target
compiler pipeline, or export a correctly identified Loon artifact. Adding Loon to
one picker without the rest of the plumbing would create invalid metadata and
fallback behavior. Export also needs a current-result gate before exposure so a
previous successful artifact cannot survive a graph/target transition.

The compiler's unsupported protocol, DNS, routing, remote-source, and serializer
cases fail closed. Those are accepted limitations or deferred scope when the
product surface clearly reports the blocker and prevents export; they are not,
by themselves, reasons to broaden the Foundation allowlist.

## 1a. Paused integration follow-up (2026-08-25)

The lifecycle blocker is now addressed internally without changing the release
decision. Loon is registered as a complete `PrimaryTarget` with
`productStatus: 'paused'`, a central evidence-bounded capability profile, and a
lazy compiler-registry loader. Projects can be created by internal code,
resolved from explicit or legacy output metadata, persisted, hydrated, switched,
and undone/redone without graph loss. The compile hook also maintains a real
Loon compiler state and uses that state for paused-target health diagnostics.

`PRODUCT_TARGETS` remains exactly Mihomo and Surge, so Loon is still absent from
ordinary New Project, target switching, Preview, and Export. Preview/export
integration remains a separate follow-up and no schema or version change was
made.

## 2. Current accepted baseline

| Item | Accepted fact | Evidence |
| --- | --- | --- |
| Product target status | Mihomo and Surge are the only officially exposed targets; Loon is developer-hidden. | [`docs/loon-compiler.md`](loon-compiler.md#L1-L8), [`docs/releases/1.1.0.md`](releases/1.1.0.md#L1-L5) |
| Loon client | Loon `3.5.0 (975)`; iOS version was not recorded. | [`docs/loon-acceptance.md`](loon-acceptance.md#L234-L247) |
| Real subscription | 95 candidates, 91 compatible, 4 intentionally skipped, 0 blockers. Skips were 2 SS2022 AES-256 and 2 VLESS Reality. | [`docs/loon-acceptance.md`](loon-acceptance.md#L216-L232) |
| Core client result | Real import and real proxy traffic passed. | [`docs/loon-acceptance.md`](loon-acceptance.md#L234-L247) |
| Service Rules | Foundation and deterministic generation passed. OpenAI recognition, fetch/refresh, policy binding, traffic, and `FINAL -> DIRECT` passed on the real client. The other nine services have deterministic/semantic parity only. | [`docs/loon-compiler.md`](loon-compiler.md#L16-L45), [`docs/loon-acceptance.md`](loon-acceptance.md#L324-L355) |
| Routing evidence | Controlled local-vs-Remote result is `LOCAL_FIRST`; controlled Google/Gemini Remote-vs-Remote result is `FIRST_SUBSCRIPTION_WINS`. These results are narrow and do not generalize. | [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md#L52-L91) |
| Production routing boundary | Domain-family Local-before-Remote is conditional; Remote-before-local, IP-family local plus Remote, mixed domain/IP families, and generalized different-policy Remote-vs-Remote remain fail-closed. | [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md#L110-L141), [`src/targets/loon/compatibility.ts`](../src/targets/loon/compatibility.ts#L122-L237) |

## 3. Product exposure prerequisites

Before Loon can become an ordinary target, all of the following must be true:

1. A complete central capability profile and lazy compiler-registry loader must
   agree on the target id, version, status, capabilities, and ordering.
2. New Project, hydration, persistence, target switching, and undo/redo must
   carry one consistent Loon `primaryTarget` and output client.
3. Preview and export must invoke the Loon compiler, label its syntax, and bind
   artifact identity to the current graph/result generation.
4. Incompatible or unproven intent must be visible and actionable in the UI;
   no fallback to Mihomo may make a Loon Project appear valid.
5. CI must protect the checked-in Loon acceptance and precedence evidence that is
   currently only available as local npm scripts.

The first four are exposure safety gates. Optional native protocols and broader
real-client coverage can follow a separate, explicitly documented release plan.

## 4. Target Registry audit

### Observed path

- At the audit baseline, [`PRIMARY_TARGETS`](../src/core/capabilities/targetCapabilities.ts#L6-L10)
  contained only `mihomo`, `surge`, and `sing-box`. The paused integration now
  adds `loon`; `PRODUCT_TARGETS` still filters only profiles whose
  `productStatus` is `supported` ([lines 420-426](../src/core/capabilities/targetCapabilities.ts#L420-L426)).
- The central `targetCapabilityRegistry` now has a complete paused `loon` key.
  Its profile is deliberately conservative: unproven protocol, routing,
  rule-source, DNS, chain, and remote-source cases remain `partial` or
  `unsupported` with the existing Loon diagnostics.
- `TargetClient` includes `loon`, but this wider output union is not a product
  registry ([`src/types/output.ts`](../src/types/output.ts#L1-L8)).
- `outputDefinitions` contains Loon only as `coming-soon`; supported production
  definitions filter it out ([`src/data/demoProject.ts`](../src/data/demoProject.ts#L25-L35)).
- The compiler registry lazily registers Mihomo, sing-box, Surge, and the
  internal Loon compiler ([`src/core/compiler/index.ts`](../src/core/compiler/index.ts#L1-L23)).
- The target-local matrix in [`src/targets/loon/capabilities.ts`](../src/targets/loon/capabilities.ts#L18-L44)
  is intentionally separate from product exposure.

### Finding

The internal registry/lazy-loader blocker is **ADDRESSED**. Product exposure is
still **BLOCKED by design** because Loon remains paused and is not in
`PRODUCT_TARGETS`; a direct `src/targets/loon` compiler still does not make Loon
a selectable product target.

## 5. New Project audit

`NewProjectDialog` iterates `PRODUCT_TARGETS` and initializes its selection to
Mihomo ([`src/components/workspace/NewProjectDialog.tsx`](../src/components/workspace/NewProjectDialog.tsx#L22-L43),
[`#L116-L147`](../src/components/workspace/NewProjectDialog.tsx#L116-L147)).
`createBlankProject` accepts every registered `PrimaryTarget`, resolves labels
from the central registry, and keeps Mihomo-only DNS/profile defaults
([`src/data/newProject.ts`](../src/data/newProject.ts#L7-L27),
[`#L56-L69`](../src/data/newProject.ts#L56-L69)). Internal Loon projects are
therefore structurally valid while the ordinary picker still offers Mihomo and
Surge only.

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

**Paused integration answer:** internal lifecycle plumbing is **READY** and the
existing schema remains sufficient (`PROJECT_SCHEMA_VERSION = 2`). **NO** to
ordinary picker exposure: Loon is intentionally excluded until Preview/export
and their current-result gates are addressed in a separate change.

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

**Finding:** current supported-target switching is ready/no action while Loon is
hidden. The Loon path is **BLOCKED** until state, compiler recomputation,
target-specific settings, and persistence are made atomic and tested. Exposing a
button alone could silently fall back to Mihomo or leave output/primary-target
intent inconsistent.

## 7. Preview audit

`PreviewMode` is only `mihomo | surge | ir`, and `targetMeta` has no Loon entry
([`src/components/preview/PreviewModal.tsx`](../src/components/preview/PreviewModal.tsx#L16-L22)).
The hook requests only Mihomo and Surge target compiles
([`#L40-L49`](../src/components/preview/PreviewModal.tsx#L40-L49),
[`src/components/compiler/useProjectCompiles.ts`](../src/components/compiler/useProjectCompiles.ts#L32-L57)).
Unknown preview targets are rejected by `isPreviewTarget` and reset to Mihomo
([`src/components/preview/PreviewModal.tsx`](../src/components/preview/PreviewModal.tsx#L46-L49),
[`#L180-L182`](../src/components/preview/PreviewModal.tsx#L180-L182)).

For existing targets, graph/compile errors produce an issue log, and copy/download
are disabled unless the current mode reports compile success
([`#L83-L120`](../src/components/preview/PreviewModal.tsx#L83-L120)). That is a
ready safety boundary, but it does not make a Loon preview available. A Loon
Project would currently either be impossible to select or be mislabeled as a
Mihomo preview.

**Finding:** Loon preview mode, compiler state, label, syntax, and stale-result
tests are **MUST FIX BEFORE EXPOSURE**. Existing blocked-preview gating is
**READY / NO ACTION**.

## 8. Export audit

`targetFileMeta` contains only Mihomo YAML, Surge CONF, and sing-box JSON
([`src/components/compiler/exportFile.ts`](../src/components/compiler/exportFile.ts#L4-L10)).
Loon fixtures use `.conf`, but that historical convention is not product metadata
and does not prove a MIME/extension contract. `buildTargetExportArtifact` rejects
failed or empty results, which is covered by [`exportFile.test.ts`](../src/components/compiler/exportFile.test.ts#L4-L20),
and the current export UI disables controls when no artifact exists
([`src/components/workspace/WorkspaceTargets.tsx`](../src/components/workspace/WorkspaceTargets.tsx#L127-L142),
[`#L167-L195`](../src/components/workspace/WorkspaceTargets.tsx#L167-L195)).

There is an additional exposure safety gap: `useTargetCompile` sets `loading`
in an effect and does not synchronously clear the previous `result`
([`src/components/compiler/useTargetCompile.ts`](../src/components/compiler/useTargetCompile.ts#L21-L46)).
The export panel builds its artifact from `state.result` alone
([`src/components/workspace/WorkspaceTargets.tsx`](../src/components/workspace/WorkspaceTargets.tsx#L105-L119)).
A graph/target transition can therefore render one stale successful artifact
before the new compile effect settles. No regression test currently binds the
artifact to the current graph/result generation.

**Finding:** Loon extension/MIME/target identity and current-result export
gating are **MUST FIX BEFORE EXPOSURE**. Existing failed-result/empty-content
gating is **READY / NO ACTION**. Do not claim that the product currently supports
a Loon `.conf` download.

## 9. Compatibility UX audit

`DiagnosticPresentationList` exposes a human title, description, impact, action,
technical details, and an optional locate-node action
([`src/components/compiler/DiagnosticPresentationList.tsx`](../src/components/compiler/DiagnosticPresentationList.tsx#L21-L55)).
However, only Surge skipped/materialized and Mihomo variant diagnostics receive
target-specific presentation buckets. All `LOON_*` codes go through the generic
path in `presentGeneric` ([`src/components/compiler/diagnosticPresentation.ts`](../src/components/compiler/diagnosticPresentation.ts#L130-L142),
[`#L194-L220`](../src/components/compiler/diagnosticPresentation.ts#L194-L220)).
The exact code and compiler message are present only in collapsed Technical
details. Node location works only when an issue entity/node id matches a real
graph node ([`src/core/compiler/diagnostics.ts`](../src/core/compiler/diagnostics.ts#L15-L19)).

Thus a user may see generic “export blocked” language for
`LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED`, remote-order blockers, serializer
boundaries, or deferred protocols, with limited remediation guidance. This is
not currently silent export or semantic loss because the compiler returns an
error and the artifact gate blocks it. It is a material quality gap for a public
target.

**Status:** PARTIAL; classify as **SHOULD FIX BEFORE 1.2.0**. Add localized
Loon-specific wording that distinguishes unsupported from unproven, identifies
the affected route/service/strategy where possible, and explains the safe next
action. Do not hide the stable technical code.

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
  current-result/stale-result issue in section 8 remains a release gate before a
  Loon artifact can be exposed.
- No private subscription, credential, screenshot, or forbidden temporary file
  was read for this audit. Acceptance evidence is aggregate/textual only.
- Remote service URLs are owned but mutable on `main`; pinning generated assets
  or an immutable release manifest is recommended before a production exposure.

## 14. Deployment / CI audit

`.github/workflows/ci.yml` runs `npm ci`, the full test suite, client build,
runtime build, deployment tests, `npm run loon:acceptance`, fixture drift check,
and Docker Compose validation ([`ci.yml`](../.github/workflows/ci.yml#L19-L29)).
`.github/workflows/container.yml` runs the general test/build/deployment path but
does not run Loon acceptance ([`container.yml`](../.github/workflows/container.yml#L24-L32)).

The following scripts exist locally but are not explicit GitHub Actions steps:

- `npm run loon:service-rules:acceptance`
- `npm run loon:precedence:acceptance`

Their absence is a **SHOULD FIX BEFORE 1.2.0** coverage gap. A locally available
script is not CI protection. Any future exposure gate should run deterministic
service-rule and precedence acceptance, verify checked-in golden drift, and keep
real-client evidence as a separately recorded/manual acceptance axis.

### Verification run for this audit

The following commands were run from the clean baseline before this document was
added. All exited successfully:

| Command | Result |
| --- | --- |
| `npm test -- --run` | 105 test files, 1102 tests passed |
| `npm run test:deployment` | 40/40 deployment tests passed |
| `npm run build` | Passed; Vite client build completed |
| `npm run runtime:build` | Passed; Runtime bundle completed |
| `npx tsc -b --pretty false` | Passed with no output |
| `npm run loon:acceptance` | Passed; 11 sanitized candidates, 0 blockers; fixture generated |
| `npm run loon:service-rules:acceptance` | Passed; one OpenAI Remote Rule; fixture generated |
| `npm run loon:precedence:acceptance` | Passed; four profiles; no private data required |
| `git diff --check` | Passed after the docs-only change |

Acceptance scripts wrote only their existing ignored/generated artifacts. No
private subscription or credential file was opened.

## 15. Release blocker matrix

| Area | Current Status | Evidence | User Impact | Classification | Required Action |
| --- | --- | --- | --- | --- | --- |
| Target Registry / compiler registration | Loon is now a complete central paused profile with a lazy compiler loader; it remains absent from product targets. | [`targetCapabilities.ts`](../src/core/capabilities/targetCapabilities.ts#L6-L53), [`compiler/index.ts`](../src/core/compiler/index.ts#L1-L23), registry test. | No ordinary product path can select Loon; internal code can resolve and compile it. | ADDRESSED INTERNALLY | Keep `productStatus: 'paused'` and `PRODUCT_TARGETS` exposure unchanged until downstream gates pass. |
| New Project / persistence plumbing | Internal creation, resolver, storage round-trip, hydration, unknown-target recovery, and overview rendering now handle registered Loon safely. | [`NewProjectDialog.tsx`](../src/components/workspace/NewProjectDialog.tsx#L22-L43), [`newProject.ts`](../src/data/newProject.ts#L7-L69), [`primaryTarget.ts`](../src/core/project/primaryTarget.ts#L12-L25), [`projectStorage.ts`](../src/storage/projectStorage.ts#L90-L107), [`ProjectOverview.tsx`](../src/components/workspace/ProjectOverview.tsx#L161-L168). | A paused Loon Project can survive internal lifecycle operations without graph loss; ordinary creation remains hidden. | ADDRESSED INTERNALLY | Keep the existing schema and recovery behavior; do not expose the picker in this phase. |
| Target Switch / state consistency | Internal target switching, low-level output edits, compiler state selection, hydration, and undo/redo keep registered target metadata synchronized; UI still iterates product targets only. | [`WorkspaceTargets.tsx`](../src/components/workspace/WorkspaceTargets.tsx#L32-L90), [`useBuilderStore.ts`](../src/store/useBuilderStore.ts#L450-L463), [`#L597-L620`](../src/store/useBuilderStore.ts#L597-L620). | Internal transitions preserve intent and graph state without reporting another target's compiler state. | ADDRESSED INTERNALLY | Keep paused-target messaging and do not add Loon to ordinary switch cards. |
| Preview pipeline | Preview modes, metadata, and compile hook omit Loon; unknown targets retain the pre-existing Mihomo safety fallback. | [`PreviewModal.tsx`](../src/components/preview/PreviewModal.tsx#L16-L49), [`useProjectCompiles.ts`](../src/components/compiler/useProjectCompiles.ts#L32-L57). | Loon cannot be previewed; Preview remains a separate exposure gate. | MUST FIX BEFORE EXPOSURE | Add Loon mode/state/label/plain-text rendering only in a separate PR with stale transition coverage. |
| Export metadata and current-result gate | No Loon extension/MIME metadata; artifact construction does not bind a previous result to the current graph generation. | [`exportFile.ts`](../src/components/compiler/exportFile.ts#L4-L29), [`useTargetCompile.ts`](../src/components/compiler/useTargetCompile.ts#L21-L46), export panel. | Missing metadata breaks download; a transition can briefly expose stale config, risking silent wrong export. | MUST FIX BEFORE EXPOSURE | Define evidence-backed Loon artifact metadata and require current successful result + current graph/target identity before copy/download/preview. |
| Compatibility UX | All Loon codes use generic copy; exact code/message is collapsed and node mapping is partial. | [`diagnosticPresentation.ts`](../src/components/compiler/diagnosticPresentation.ts#L130-L220), [`DiagnosticPresentationList.tsx`](../src/components/compiler/DiagnosticPresentationList.tsx#L41-L53). | Users may not understand whether a blocker is unsupported, unproven, or how to fix it. | SHOULD FIX BEFORE 1.2.0 | Add localized Loon-specific titles, impact, remediation, and affected-entity mapping while retaining technical codes. |
| CI acceptance coverage | CI runs `loon:acceptance` but not the service-rules or precedence acceptance scripts. | [`ci.yml`](../.github/workflows/ci.yml#L19-L29); package scripts. | Regressions in the newest evidence boundaries may pass CI unnoticed. | SHOULD FIX BEFORE 1.2.0 | Add deterministic service-rule and precedence jobs plus golden drift checks to the exposure gate. |
| First-party Service Rule client breadth | Ten assets have deterministic parity; only OpenAI has real-client acceptance. | [`serviceRuleAssets.ts`](../src/data/serviceRuleAssets.ts#L1-L17), [`loon-acceptance.md`](loon-acceptance.md#L324-L355). | Other services could differ in client matching/refresh behavior despite valid generated bytes. | SHOULD FIX BEFORE 1.2.0 | Run sanitized real-client acceptance for a representative/broader service set; do not claim all ten today. |
| Mutable owned rule URLs | Asset URLs use the rules repository `main` branch. | [`serviceRuleAssets.ts`](../src/data/serviceRuleAssets.ts#L1-L14). | A later upstream change can alter a fetched production rule list without a ProxyFlow release. | SHOULD FIX BEFORE 1.2.0 | Pin an immutable commit/release manifest and verify generated content hashes. |
| Supported protocol subset | HTTP and selected conditional protocols compile; unsupported variants fail with explicit diagnostics. | [`proxies.ts`](../src/targets/loon/proxies.ts#L34-L91), [`compiler.ts`](../src/targets/loon/compiler.ts#L64-L74). | Users cannot use optional variants, but no silent downgrade occurs. | ACCEPTED LIMITATION | Document the exact subset and keep blocked export behavior. |
| Strategy semantics | Select/URL Test/Fixed/Round-Robin subset works; fallback tolerance, PCC, and active chains block. | [`compatibility.ts`](../src/targets/loon/compatibility.ts#L253-L299), strategy tests. | Some strategy intents cannot be exported. | ACCEPTED LIMITATION | Keep fail-closed diagnostics; do not claim statistical or failover equivalence. |
| Domain/IP and Local/Remote precedence | Pure families preserve Universal order; mixed families, IP+Remote, and Remote-before-local block. | [`compatibility.ts`](../src/targets/loon/compatibility.ts#L122-L237), precedence tests/docs. | Some route graphs cannot compile; accepted graphs cannot silently reorder. | ACCEPTED LIMITATION | Preserve guards and expose the conditional rule in UX/docs. |
| Serializer grammar | Conservative raw-token/fixed-quoted grammar; delimiter-sensitive or unproven values fail closed. | [`serializer.ts`](../src/targets/loon/serializer.ts#L87-L174), serializer tests. | Some credentials/values are rejected instead of guessed. | ACCEPTED LIMITATION | Retain the proven grammar; only widen after pinned parser/client evidence. |
| DNS lowering | System, safe bare IPv4 UDP, and pure DoH subsets; DoT, roles, mixed semantics, and unmodeled forms block. | [`src/targets/loon/dns.ts`](../src/targets/loon/dns.ts#L18-L94), DNS tests. | Advanced DNS intent is unavailable, with no silent downgrade. | ACCEPTED LIMITATION | Keep explicit diagnostics and document the supported subset. |
| Arbitrary rule sets / native Remote Proxy Source | URL-plus-policy syntax is known, but arbitrary list grammar, HTTP behavior, refresh/cache/failure semantics are not proven. | [`docs/loon-compiler.md`](loon-compiler.md#L320-L365), `LOON_RULE_SOURCE_FORMAT_UNPROVEN` and `LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN`. | User-provided remote sources remain unavailable; copying Surge format would be unsafe. | DEFERRED | Require a checked-in artifact, deterministic generator, matcher-parity tests, and real-client import/update/failure evidence before implementation. |
| Generalized Remote-vs-Remote semantics | One controlled Google/Gemini pair shows first-subscription-wins; generalized different-policy overlap remains unproven. | [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md#L68-L121). | Broader conflicting remote combinations remain blocked. | DEFERRED | Gather new real-client fixtures before changing `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN`. |
| Optional native protocol expansion | Reality/Vision/flow, SS2022 AES-256, SOCKS5, AnyTLS, TUIC, SSR, WireGuard, custom JS, and Proxy Chain are outside the current IR/lowering phase. | [`src/targets/loon/capabilities.ts`](../src/targets/loon/capabilities.ts#L19-L43), protocol tests. | Feature breadth is incomplete but blocked safely. | DEFERRED | Design a separate IR/evidence PR for each family; no coercion or silent fallback. |
| Existing fail-closed compiler/export behavior | Failed Loon compile returns empty content; existing target export rejects failed/empty results; inactive inventory and partial pools are isolated. | [`compiler.ts`](../src/targets/loon/compiler.ts#L27-L74), [`exportFile.ts`](../src/components/compiler/exportFile.ts#L18-L29), projection tests. | Current developer-only workflows do not emit partial configs. | READY / NO ACTION | Preserve these invariants while wiring product exposure. |
| Schema shape / version | `primaryTarget?: PrimaryTarget` and schema V2 already exist; no new field is inherently required for initial exposure. | [`src/types/project.ts`](../src/types/project.ts#L166-L178), [`src/core/project/version.ts`](../src/core/project/version.ts#L1-L15). | A target can reuse the existing shape once validation/registry plumbing is complete. | READY / NO ACTION | Avoid a speculative schema bump; add only evidenced target-specific settings. |

Matrix row counts: **MUST FIX BEFORE EXPOSURE 2**; **ADDRESSED INTERNALLY 3**;
**SHOULD FIX BEFORE 1.2.0 4**; **ACCEPTED LIMITATION 5**; **DEFERRED 3**;
**READY / NO ACTION 2**.

## 16. Recommended implementation sequence

These are recommendations for later, separate PRs. They are not implemented by
this audit.

### PR A — Loon product integration plumbing

- **Goal:** Add a complete central capability profile, product status/order,
  target metadata, and lazy compiler loader while keeping the feature flag
  developer-hidden.
- **Why:** Resolves the registry blocker and gives every surface one source of
  truth.
- **Out of scope:** No public exposure, protocol expansion, or schema bump by
  assumption.

### PR B — Project lifecycle and target-state integrity

- **Goal:** Extend New Project, hydration/resolution, persistence, target switch,
  target-specific defaults, output node synchronization, and undo/redo for Loon.
- **Why:** Resolves invalid-picker, fallback, and target-intent corruption risks.
- **Out of scope:** Do not rewrite graph semantics or coerce unsupported fields.

### PR C — Preview/export safety and compatibility UX

- **Goal:** Add Loon preview/compiler state, evidence-backed artifact metadata,
  current-result identity gating, stale transition tests, and localized Loon
  diagnostic presentations.
- **Why:** Resolves the preview/export MUST items and makes fail-closed limits
  actionable.
- **Out of scope:** No widening of compiler allowlists.

### PR D — Evidence and CI hardening

- **Goal:** Run service-rules and precedence acceptance in CI, pin owned rule
  assets or hashes, and add broader sanitized real-client Service Rule checks.
- **Why:** Closes the 1.2.0 evidence/supply-chain quality gaps.
- **Out of scope:** Do not claim all ten services are real-client proven until
  each result is recorded.

### PR E — Explicit exposure gate

- **Goal:** After PRs A–D pass, add a narrowly reviewed feature-flag change that
  makes Loon selectable and update public product documentation.
- **Why:** Only then is the ordinary product path end-to-end and auditable.
- **Out of scope:** No merge/ready action belongs to this audit; deferred native
  protocols and generalized Remote semantics remain unavailable.

### Post-1.2.0 deferred work

Treat Reality/Vision/flow, SS2022 AES-256, SOCKS5/AnyTLS/TUIC, SSR/WireGuard/
custom JS, Proxy Chain, arbitrary remote lists, and generalized precedence as
separate evidence-and-IR projects rather than bundling them into exposure.

## 17. Explicit non-goals / deferred scope

This audit does not:

- add Loon to the Target Registry, New Project, Target Switch, Preview, or
  Export surfaces;
- register the Loon compiler in the product compiler registry;
- change projection semantics, inactive inventory isolation, partial-pool skip
  behavior, `FINAL`, DNS boundaries, remote-source boundaries, Project schema,
  compiler registry behavior, UI exposure, Mihomo, Surge, sing-box, Runtime, or
  version;
- modify or reinterpret [`docs/loon-routing-precedence-acceptance.md`](loon-routing-precedence-acceptance.md),
  its fixtures, generator, or acceptance implementation;
- implement Reality, Vision/flow, SS2022 AES-256, SOCKS5, AnyTLS, TUIC, SSR,
  WireGuard, custom JS, Proxy Chain, arbitrary rule-set sources, or generic
  serializer escaping;
- infer Loon capability from Mihomo, Surge, Shadowsocks convention, or community
  repositories; or copy Surge remote-rule URLs into a Loon format;
- claim real-client evidence for the nine non-OpenAI service assets;
- inspect private subscription/credential data or the forbidden temporary files.

**NOT READY FOR PRODUCT EXPOSURE**

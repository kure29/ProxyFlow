# Loon Routing Precedence Acceptance

`LOON ROUTING PRECEDENCE REAL CLIENT ACCEPTANCE: PENDING`

This is a developer-only, acceptance/research harness for Loon `3.5.0 (975)`. It
does not change the production compiler, remove a compatibility blocker, or
enable Loon in ProxyFlow product surfaces. The four profiles contain no proxy
nodes, credentials, private subscriptions, or real endpoints; they use only
`DIRECT`, `REJECT`, public first-party rule URLs, and public test domains.

## Accepted baseline

The following evidence remains accepted and is not reopened here:

- Core Loon import: **PASSED**
- Core Loon proxy traffic: **PASSED**
- First-party Service Rules foundation: **IMPLEMENTED**
- First-party Service Rules deterministic acceptance: **PASSED**
- First-party Service Rules real-client acceptance: **PASSED** for OpenAI
- Tested client: Loon `3.5.0 (975)`

This phase only prepares evidence for unresolved ordering semantics.

## Pinned evidence

The controlled assets are owned by `kure29/proxyflow-rules` and were audited
at commit [`27d38e44282115e071d19c846c17e14e6d2e584b`](https://github.com/kure29/proxyflow-rules/commit/27d38e44282115e071d19c846c17e14e6d2e584b):

- [`Google.list` lines 8-12](https://github.com/kure29/proxyflow-rules/blob/27d38e44282115e071d19c846c17e14e6d2e584b/rules/loon/Google.list#L8-L12)
  includes `DOMAIN,www.google.com` and `DOMAIN-SUFFIX,googleapis.com`.
- [`Gemini.list` lines 8-11](https://github.com/kure29/proxyflow-rules/blob/27d38e44282115e071d19c846c17e14e6d2e584b/rules/loon/Gemini.list#L8-L11)
  includes `DOMAIN,generativelanguage.googleapis.com`.

The current first-party Loon pages were audited on **2026-08-24** at the live
[`rule`](https://nsloon.app/docs/Rule/rule/) and
[`sub_rule`](https://nsloon.app/docs/Rule/sub_rule/) pages; their checked-in
source is pinned to
[`Loon0x00/Loon0x00.github.io` commit `a34f179a48e2bbd4207824be24195694a3b2ab44`](https://github.com/Loon0x00/Loon0x00.github.io/blob/a34f179a48e2bbd4207824be24195694a3b2ab44/docs/Rule/rule.md#L11-L17).
It describes domain rules before DNS/IP rules and source priority of local
rules over subscription rules. That source does not define ordering among
multiple Remote Rule subscriptions. The rule-subscription page proves only a
URL-plus-policy collection syntax ([`sub_rule.md` lines 5-10](https://github.com/Loon0x00/Loon0x00.github.io/blob/a34f179a48e2bbd4207824be24195694a3b2ab44/docs/Rule/sub_rule.md#L5-L10)); the first-party example confirms the concrete
`[Remote Rule]` line form ([`example.conf` lines 91-105](https://github.com/Loon0x00/LoonExampleConfig/blob/dfbfc0b74dd689d9d76d5b6da7fe3778791c0710/example.conf#L91-L105)). Documentation is not substituted for the real-client run.

## Experiment A: local versus Remote Rule

Both profiles request `https://www.google.com/generate_204` and use the exact
Google asset. Only the local and remote policies are inverted:

| Profile | Local `[Rule]` | Remote Google policy | Observed policy |
| --- | --- | --- | --- |
| `local-reject-remote-direct.conf` | `REJECT` | `DIRECT` | `PENDING` |
| `local-direct-remote-reject.conf` | `DIRECT` | `REJECT` | `PENDING` |

Interpretation after a clean, paired run:

- first profile `REJECT`, second `DIRECT`: `LOCAL_FIRST`
- first profile `DIRECT`, second `REJECT`: `REMOTE_FIRST`
- any other or ambiguous result: `INCONCLUSIVE`

`LOCAL VS REMOTE PRECEDENCE: PENDING`

The source-level documentation cited above is useful context, but this record
does not turn it into a completed client acceptance or alter the production
guard.

## Experiment B: Remote Rule versus Remote Rule

Both profiles request `https://generativelanguage.googleapis.com/`. Google is
always `REJECT`; Gemini is always `DIRECT`; only subscription order changes:

| Profile | First remote | Second remote | Observed policy |
| --- | --- | --- | --- |
| `remote-google-first.conf` | Google -> `REJECT` | Gemini -> `DIRECT` | `PENDING` |
| `remote-gemini-first.conf` | Gemini -> `DIRECT` | Google -> `REJECT` | `PENDING` |

Interpretation after a clean paired run:

- Google-first `REJECT`, Gemini-first `DIRECT`: `FIRST_SUBSCRIPTION_WINS`
- Google-first `DIRECT`, Gemini-first `REJECT`: `LAST_SUBSCRIPTION_WINS`
- both `DIRECT` or both `REJECT`: `ORDER_INDEPENDENT_OBSERVED`, describing the
  matcher that won; do not generalize beyond this overlap
- ambiguous results: `INCONCLUSIVE`

`REMOTE VS REMOTE PRECEDENCE: PENDING`

Important caveat: the controlled overlap is not a generic subscription-order
test. Google contributes `DOMAIN-SUFFIX,googleapis.com`, while Gemini
contributes the exact `DOMAIN,generativelanguage.googleapis.com`. A result may
therefore reflect matcher-type precedence rather than Remote Rule list order.

## Manual procedure

Run `npm run loon:precedence:acceptance`, then transfer the four files from
`tmp/loon-precedence-acceptance/` to the test device. For each profile, import
and activate the intended profile, refresh its Remote Rule resources, and toggle
Loon off/on if needed. Use a fresh Safari/private request, inspect a **new**
request record with the current timestamp, and record the matched policy from
the request detail. Do not reuse cached logs or rely only on browser success.
Use the target URL listed in each experiment; an HTTP error response is still
useful secondary evidence when the request was not rejected.

## Production decision

`PRODUCTION BLOCKER DECISION: PENDING REAL CLIENT ACCEPTANCE`

The following guards remain unchanged in this branch:

- `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN` for local/Remote or different-
  policy Remote Rule ordering
- `LOON_SERVICE_RULE_POLICY_CONFLICT` for one service URL assigned conflicting
  policies
- `LOON_RULE_SOURCE_FORMAT_UNPROVEN` for arbitrary rule sets
- `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for active mixed domain/IP families

No result is prefilled, simulated, or generalized. Product exposure remains
disabled.

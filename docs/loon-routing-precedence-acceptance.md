# Loon Routing Precedence Acceptance

`LOON ROUTING PRECEDENCE REAL CLIENT ACCEPTANCE: PASSED`

`LOCAL VS REMOTE PRECEDENCE: LOCAL_FIRST`

`REMOTE VS REMOTE PRECEDENCE: FIRST_SUBSCRIPTION_WINS`

`PRODUCTION BLOCKER DECISION: READY FOR FOLLOW-UP REVIEW`

This document closes the developer-only real-client acceptance run prepared by
PR #44. It records request-detail observations from Loon `3.5.0 (975)`; the
exact iOS version was **NOT RECORDED**. The result means that all four planned
profiles produced internally consistent observations. It does not prove every
Loon routing-ordering semantic and does not change the production compiler.

The four profiles contain no proxy nodes, credentials, private subscriptions,
or real endpoints. They use only `DIRECT`, `REJECT`, public first-party rule
URLs, and public test domains.

## Accepted baseline

The following evidence remains accepted and is not reopened here:

- Core Loon import: **PASSED**
- Core Loon proxy traffic: **PASSED**
- First-party Service Rules foundation: **IMPLEMENTED**
- First-party Service Rules deterministic acceptance: **PASSED**
- First-party Service Rules real-client acceptance: **PASSED** for OpenAI
- Tested client: Loon `3.5.0 (975)`

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
The rule page describes domain rules before DNS/IP rules and source priority of
local rules over subscription rules. It does not define ordering among
multiple Remote Rule subscriptions. The subscription page proves only a
URL-plus-policy collection syntax ([`sub_rule.md` lines 5-10](https://github.com/Loon0x00/Loon0x00.github.io/blob/a34f179a48e2bbd4207824be24195694a3b2ab44/docs/Rule/sub_rule.md#L5-L10)); the first-party example confirms the concrete `[Remote Rule]` line form ([`example.conf` lines 91-105](https://github.com/Loon0x00/LoonExampleConfig/blob/dfbfc0b74dd689d9d76d5b6da7fe3778791c0710/example.conf#L91-L105)). The conclusions below rely on the supplied real-client request records, not documentation inference.

## Experiment A: local versus Remote Rule

Target: `www.google.com` using `https://www.google.com/generate_204`. The two
profiles invert only the local and Google Remote Rule policies.

| Profile | Local `[Rule]` | Google Remote policy | Matched rule in Loon request detail | Observed result |
| --- | --- | --- | --- | --- |
| `local-reject-remote-direct.conf` | `DOMAIN,www.google.com,REJECT` | `DIRECT` | `DOMAIN,www.google.com,REJECT` | `REJECT` (intercepted / blocked successfully) |
| `local-direct-remote-reject.conf` | `DOMAIN,www.google.com,DIRECT` | `REJECT` | `DOMAIN,www.google.com,DIRECT` | `DIRECT` |

Both request records matched the local `[Rule]` entry before the conflicting
first-party Remote Rule. This is direct request-detail evidence rather than
browser-only behavior.

`LOCAL VS REMOTE PRECEDENCE: LOCAL_FIRST`

## Experiment B: Remote Rule versus Remote Rule

Target: `generativelanguage.googleapis.com` using
`https://generativelanguage.googleapis.com/`. Google was always `REJECT` and
Gemini was always `DIRECT`; only subscription order changed.

| Profile | First remote | Second remote | Matched rule and source | Observed result |
| --- | --- | --- | --- | --- |
| `remote-google-first.conf` | Google -> `REJECT` | Gemini -> `DIRECT` | `DOMAIN-SUFFIX,googleapis.com,REJECT` from `Google.list` | `REJECT` (DNS-REJECT / blocked successfully) |
| `remote-gemini-first.conf` | Gemini -> `DIRECT` | Google -> `REJECT` | `DOMAIN,generativelanguage.googleapis.com,DIRECT` from `Gemini.list` | `DIRECT` |

Changing only Remote Rule order changed the matched source and policy. In both
directions the first subscription won in this controlled pair:

`REMOTE VS REMOTE PRECEDENCE: FIRST_SUBSCRIPTION_WINS`

### Matcher-type boundary

Google contributes `DOMAIN-SUFFIX,googleapis.com`, while Gemini contributes the
exact `DOMAIN,generativelanguage.googleapis.com`. The paired result cannot be
explained simply as “exact DOMAIN always beats DOMAIN-SUFFIX”: when Google was
first, its suffix rule matched before the later exact Gemini rule. Nevertheless,
this is one controlled overlap and must not be generalized to every matcher
combination or every Remote Rule source.

## Manual procedure and evidence quality

The four generated profiles were imported and tested on the real Loon client.
For each profile, the intended profile was activated, resources were refreshed,
and a fresh request record was inspected. The observations above are copied
from those request details. Future reruns should toggle Loon if needed, use a
fresh/private request, inspect a new record with the current timestamp, and not
reuse cached logs or rely only on browser success.

## Proven by this acceptance

- In the tested Google overlap, local `[Rule]` matched before the first-party
  Google Remote Rule (`LOCAL_FIRST`).
- In the tested Google/Gemini overlap, changing only subscription order changed
  the matched Remote Rule source, with the first subscription winning in both
  directions (`FIRST_SUBSCRIPTION_WINS`).

## Not proven by this acceptance

This result does **not** prove:

- arbitrary Remote Rule ordering for every matcher combination;
- arbitrary user-provided remote lists or generic `rule-set` semantics;
- mixed domain/IP precedence;
- native Remote Proxy Source semantics;
- every Loon routing feature or every first-party service individually;
- long-duration Remote Rule behavior;
- malformed Remote Rule failure semantics;
- cache/offline persistence semantics.

## Production decision and preserved guards

`PRODUCTION BLOCKER DECISION: READY FOR FOLLOW-UP REVIEW`

This means the evidence is sufficient to open a separate engineering review. It
does **not** mean a production blocker was removed or that
`LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN` is resolved in production.

The following guards remain unchanged in PR #44:

- `LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN` for local/Remote or
  different-policy Remote Rule ordering;
- `LOON_SERVICE_RULE_POLICY_CONFLICT` for one service URL assigned conflicting
  policies;
- `LOON_RULE_SOURCE_FORMAT_UNPROVEN` for arbitrary rule sets;
- `LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED` for active mixed domain/IP families.

No result is simulated or generalized. Loon remains developer-hidden and
product exposure remains disabled.

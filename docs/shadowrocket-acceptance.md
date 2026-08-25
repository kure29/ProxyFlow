# Shadowrocket Acceptance Gate

This is a human-gated workflow. The checked-in deterministic profile is only a
serializer/fixture check; it is not real-client evidence.

Run the network-free check with:

```bash
npm run shadowrocket:acceptance
```

The generated profile is `fixtures/shadowrocket/acceptance.expected.conf` and
contains only documentation-domain values. The script fails on fixture drift,
runtime data, CRLF, or more than one trailing newline.
It also prints a SHA-256 digest; record that digest with any human-gated client
observation so the tested artifact is unambiguous.

## Required real-client observations

Use a sanitized copy of the exact generated profile and record the app version,
OS version, import result, and observations without credentials or endpoint
secrets.

1. Import the profile. Expected: Shadowrocket accepts the profile and shows
   one HTTP proxy, one `select` group, the domain-suffix rule, and FINAL.
2. Verify proxy traffic to a controlled documentation endpoint through the
   selected proxy. Expected: the request reaches the proxy and the direct
   control request does not use the proxy.
3. Select each strategy member in a two-member profile. Expected: selection is
   retained and traffic follows the selected member.
4. Exercise URL-test/fallback/load-balance separately only after their exact
   group syntax is pinned. Expected: observed member choice matches the
   Universal strategy semantics and documented test interval/tolerance.
5. Test overlapping DOMAIN, DOMAIN-SUFFIX, IP-CIDR, IP-CIDR6, and GEOIP rules
   with controlled endpoints. Expected: the observed first-match order equals
   Universal priority then stable insertion order.
6. Test system and IPv4 UDP DNS resolvers. Expected: resolver selection matches
   the emitted global `dns-server` list. Do not claim DoH/DoT support from this
   profile.
7. Test one representative materialized subscription projection. Expected:
   every emitted proxy is recognized and traffic succeeds; any skipped endpoint
   is explained by a target diagnostic.

## Sanitized evidence record template

```text
Shadowrocket version:
OS version:
ProxyFlow commit/worktree:
Artifact: fixtures/shadowrocket/acceptance.expected.conf
Artifact SHA-256:

Import:       PASSED | FAILED | NOT RUN
Proxy traffic: PASSED | FAILED | NOT RUN
Select group: PASSED | FAILED | NOT RUN
URL-test:     PASSED | FAILED | NOT RUN
Fallback:     PASSED | FAILED | NOT RUN
Load-balance: PASSED | FAILED | NOT RUN
Rule order:   PASSED | FAILED | NOT RUN
DNS:          PASSED | FAILED | NOT RUN
Subscription: PASSED | FAILED | NOT RUN

Sanitized observations:
Reproduction notes:
Limitations or failed claims:
```

For every observation, record `PASSED`, `FAILED`, or `NOT RUN`, the exact
generated artifact hash, and the evidence needed to reproduce it. Never turn a
failed import or traffic test into a broader allowlist. A real result must be
added to this file and `docs/shadowrocket-rc-readiness.md` before changing the
target from paused to supported.

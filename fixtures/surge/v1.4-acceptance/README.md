# Surge 1.4 real-client acceptance package

These five Projects and their generated `.conf` files are deterministic,
public, and import-safe. They are structure fixtures, not connectivity
fixtures: every proxy endpoint ends in `.example.invalid`, so a physical Surge
client cannot produce a successful proxy, URL Test, Fallback, Proxy Chain, or
Smart result from these files alone. The public fixture does not by itself
constitute evidence that the intended real DNS behavior has been successfully
verified on the target platform.

Generate and verify the goldens with:

```bash
npm run surge:acceptance
```

To intentionally refresh goldens after a reviewed compiler change, use
`npm run surge:acceptance:update`. The normal command never rewrites checked-in
files; it fails on missing or drifted output. CI additionally runs
`git diff --exit-code -- fixtures/surge/v1.4-acceptance`.

## Scenarios

| Scenario | Safety classification | Focus |
| --- | --- | --- |
| `01-core` | `IMPORT-SAFE` | Materialized subscription, manual proxy, URL Test, genuine Manual Select distinct from Fixed, Fallback, Smart, Subnet, Proxy Chain, Service Rules, ordinary routing, precedence, FINAL, encrypted DNS. |
| `02-general-connectivity` | `IMPORT-SAFE` | G1 `ipv6`, safe `ipv6-vif=auto`, `icmp-forwarding`, Universal `proxy-test-url`, and independent Surge `internet-test-url`. |
| `03-dns-behavior` | `IMPORT-SAFE` | DNS owner with `universalDnsMode=none` plus DNS-node-owned `always-real-ip`. Custom/encrypted DNS is exercised by `01-core`. |
| `04-vif-routes` | `LOCAL-NETWORK-SIDE-EFFECT` | G3-B `tun-excluded-routes` and `tun-included-routes` using RFC 5737 TEST-NET ranges only. |
| `05-proxy-bypass` | `BEHAVIOR-REQUIRES-PRIVATE-ENDPOINTS` | G3-C admitted positive `skip-proxy` Host List grammar and `exclude-simple-hostnames`. |

The split keeps one failure tied to one semantic area and isolates VIF/system
proxy side effects from the ordinary core profile. No profile enables
`ipv6-vif=always`, uses broad private LAN ranges, or couples
`skip-proxy` to `DIRECT` routing or VIF exclusion.

## Public versus private tests

Public profiles are safe for parser/import checks, section and key inspection,
policy/group inspection, and route ordering inspection. They must not be used
to claim successful proxy traffic or health checks.

For behavior testing, copy a profile outside the repository (for example to a
private temporary directory), then replace only the documented fixture proxy
hosts/credentials with controlled test endpoints. Checked-in proxy servers
must end in `.example.invalid`; every checked-in proxy username, password,
UUID, and nested obfs password must use the deterministic
`fixture-[a-z0-9-]+` convention. Never reuse production secrets as fixtures.

For `02-general-connectivity`, replace the inert public values only in the
private copy:

- Replace `proxy-test-url` with `<PROXY_TEST_URL>`, a controlled reachable URL
  suitable for testing proxy health checks.
- Replace `internet-test-url` with `<INTERNET_TEST_URL>`, a controlled
  reachable URL suitable for Surge Internet / DIRECT connectivity tests.

For `03-dns-behavior`, replace a checked-in `always-real-ip` hostname with a
controlled resolvable `<REAL_IP_TEST_HOST>`. Observe that the matching hostname
uses real upstream resolution instead of the Fake-IP behavior that applies
without `always-real-ip`. The key's presence in `[General]` is STRUCTURE
evidence only, not a behavior PASS.

For `01-core`, replace `Home-WiFi` only in the private copy with the tester's
controlled `<LOCAL_SSID>` and verify the SSID branch. The default branch and,
where the platform permits, the `CELLULAR` network-type branch may be tested
independently without an SSID substitution. Never commit a real SSID.

Use controlled private proxy candidates for the core strategy procedures:

- Fallback: make candidate 1 intentionally unavailable or failing and
  candidate 2 controlled and working; record whether Fallback advances to the
  usable candidate according to observed Surge behavior.
- Manual Select: confirm both members are visible, change the selection, and
  confirm the selected member is honored. Record this separately from the
  one-member `Manual Fixed`; Fixed is not Select acceptance.
- Smart: confirm the profile accepts the policy, all members are present, and
  the policy operates with usable private candidates. Do not claim detailed
  adaptive-selection algorithm correctness unless it was actually observed.

For `04-vif-routes`, replace the TEST-NET route values in the private copy with
`<LOCAL_TEST_HOST_IP>` or `<LOCAL_TEST_SUBNET>` values appropriate to the test
network:

1. `tun-excluded-routes`: verify the chosen local test IP/subnet is not
   captured by Surge VIF.
2. `tun-included-routes`: with a broader physical route, verify a deliberately
   more-specific included VIF route wins.

For G3-C, test the operating-system paths separately:

- On iOS, `skip-proxy` bypasses proxy takeover for matching connections; the
  connection may still be captured by VIF.
- On macOS, `skip-proxy` participates in system-proxy bypass when **Set as
  System Proxy** is enabled; it is not equivalent to `DIRECT` routing.
- Full IP-range bypass is an intentional private combination of
  `skip-proxy` and `tun-excluded-routes`, never automatic Project coupling.

An IP/CIDR Host List item matches a connection made to that literal IP form. A
hostname resolving to that IP does not automatically match the Host List.

Record results in `docs/surge-acceptance.md` using only `PASS`, `FAIL`,
`BLOCKED`, `NOT APPLICABLE`, or `NOT TESTED`. Include exact Surge Mac/iOS and
OS versions, scenario, import/parser output, and (for failures) expected,
actual, reproduction steps, and whether the limitation is compiler,
documentation, client/platform, or test-environment related. Never commit
private profiles, endpoints, credentials, LAN details, or certificates; keep
`git status` clean.

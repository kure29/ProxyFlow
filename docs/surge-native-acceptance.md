# Surge Smart / Subnet real-client acceptance (pending)

Engineering verification covers deterministic compilation only. A human must
run the following with a real Surge client and private nodes; this checklist is
not a claim of client acceptance.

1. Create/export a Surge profile with **Hong Kong Smart** and at least two real
   Hong Kong proxy endpoints. Optionally exercise a typed `policy-priority`
   rule and `evaluate-before-use=true`.
2. Add **Hong Kong Subnet** with `default → Hong Kong Smart`.
3. Add `SSID:<human-provided-home-ssid> → DIRECT` and, on a test device with a
   SIM, `MCCMNC:<five-or-six-digit-code> → Hong Kong Smart` in the Subnet editor.
4. Import the generated profile into the real Surge client and confirm it
   parses without a warning.
5. Away from the configured Wi-Fi, verify traffic uses Hong Kong Smart.
6. Join the configured home Wi-Fi and verify traffic switches to `DIRECT`.
7. Leave that Wi-Fi and verify traffic returns to Hong Kong Smart.
8. Confirm Smart continues to select valid Hong Kong proxy candidates and that
   any configured priority factors affect selection as documented.

The generated forms that must be checked during acceptance are:

```text
Hong Kong Smart = smart, HK-01, HK-02, HK-03
Hong Kong = subnet, default = Hong Kong Smart, SSID:Home-WiFi = DIRECT, TYPE:CELLULAR = Hong Kong Smart
```

For a carrier condition, the expected form is `MCCMNC:310260 = Policy` (with
the actual carrier code supplied by the human). Conditions must remain in the
declared order; the first match wins.

Do not put the real SSID, subscription URL, passwords, UUIDs, private node
links, or API tokens in fixtures, logs, commits, or issue reports.

Status: **PENDING** — engineering ready for real-client acceptance.

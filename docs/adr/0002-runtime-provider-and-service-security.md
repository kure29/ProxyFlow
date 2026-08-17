# ADR 0002: Runtime Provider and Runtime Service Security Boundary

Status: Accepted for V0.10 implementation

## Context

Browser `SourceFetcher` and `RefreshCoordinator` already implement the
subscription lifecycle used by Local Mode: fetch, parse, candidate quality,
Last Known Good (LKG), diff, race protection, empty-result protection, and
runtime snapshot persistence. The browser cannot reliably fetch every URL
because of CORS, and it cannot provide scheduled refresh while closed.

The V0.10 Runtime Service must add only those missing runtime capabilities. It
must not create a second Project, parser, Universal IR, validator, or target
compiler implementation.

## Decision

ProxyFlow keeps two runtime providers behind the same lifecycle contract:

```text
BrowserRuntimeProvider  -> BrowserSourceFetcher + IndexedDB repository
ServerRuntimeProvider   -> Runtime Service API + server repository
                                      |
                                      +-> shared parser/snapshot/diff/compiler modules
```

The Runtime Service is self-hosted, single-user, optional, and requires an API
token. Local Mode remains usable when the service is disconnected or
unavailable. A service failure never clears the browser's active LKG.

The first service surface is deliberately small:

- Subscription Fetch Gateway for one source at a time;
- scheduled refresh for configured sources;
- a bounded snapshot history (default maximum 10 per source);
- explicit restore, clear-history, and health endpoints.

The service stores runtime data in SQLite using Node 22's `node:sqlite`
interface. The service requires Node 22.5 or newer and must document that
runtime prerequisite. Project export never includes server snapshots or API
tokens.

## Fetch Gateway Security

Only `http:` and `https:` URLs are accepted. Before every request and every
redirect, the service resolves the hostname and rejects loopback, private,
link-local, multicast, unspecified, documentation metadata, and other
non-public addresses. Redirects are limited, response bytes are capped, and
connect/read timeouts, request concurrency, and per-token rate limits are
enforced. The service never logs the URL query, Authorization header, or
response body.

The service does not expose a switch that disables SSRF protection. DNS
resolution is checked for each connection attempt; redirects are revalidated
before following. Only fictional security fixtures are used in tests.

## Snapshot Ownership

The server owns only snapshots created by the Server Runtime Provider. A
successful refresh is committed atomically as a new active snapshot and a
bounded history row. A failed, invalid, or empty refresh preserves the active
snapshot unless the user explicitly confirms an empty result. Restoring a
history entry creates a new active snapshot and does not mutate the old row.

Browser IndexedDB remains the owner of Local Mode snapshots. Connecting or
disconnecting the service does not delete or replace the browser cache.

## Consequences

The service can remove browser CORS limitations without changing Project
semantics. It adds an operational Node/SQLite prerequisite and a security
surface that must be tested with fictional SSRF, size, timeout, redirect,
rate-limit, failure/LKG, history, and token-redaction cases. Full route
simulation, a third target, accounts, multi-user access, and public hosting
remain out of scope.

# ProxyFlow Runtime Service MVP

Status: V0.10 milestone implementation

Runtime Service is an optional, self-hosted, single-user companion for
browser-limited subscription runtime work. Local Mode remains the default:
Projects, parsing, validation, compilation, export, and the browser's local
Last Known Good cache continue to work when the service is disconnected.

## Start A Service

The service requires Node.js 22.5 or newer because it uses the built-in
`node:sqlite` API.

```bash
npm install
npm run runtime:build
PROXYFLOW_RUNTIME_TOKEN='replace-with-a-long-local-token' \
PROXYFLOW_RUNTIME_ORIGIN='http://127.0.0.1:5173' \
PROXYFLOW_RUNTIME_DB='./proxyflow-runtime.sqlite' \
npm run runtime:start
```

The token must contain at least 16 characters. `PROXYFLOW_RUNTIME_ORIGIN` is
an exact browser origin, not a wildcard. The default listener is
`127.0.0.1:8787`; set `PORT` and `PROXYFLOW_RUNTIME_HOST` when a different
self-hosted binding is required.

The browser panel accepts the service URL and token. The token is stored in
the current browser's local storage and is never written to Project Export.
Disconnecting the panel returns subscription refreshes to Browser Runtime and
does not delete local snapshots.

## Capabilities

- `POST /api/v1/subscriptions/fetch`: fetch one source through the gateway;
- `GET /api/v1/projects/:project/sources/:source/history`: list bounded history;
- `GET /api/v1/projects/:project/sources/:source/history/:snapshot`: inspect one
  authenticated snapshot;
- `POST /api/v1/projects/:project/sources/:source/history/restore`: restore a
  snapshot as a new active snapshot;
- `DELETE /api/v1/projects/:project/sources/:source/history`: clear history;
- `PUT /api/v1/projects/:project/sources/:source/schedule`: configure a
  refresh interval from 60 seconds to 30 days;
- `GET` and `DELETE` on the same `schedule` path: inspect or remove a schedule;
- `GET /health`: basic service health without exposing runtime data.

Successful refreshes use the existing shared parser, snapshot quality rules,
diff, and Last Known Good semantics. Invalid or failed refreshes preserve the
active snapshot. A valid empty result requires explicit confirmation. Restoring
history creates a new active snapshot and leaves the historical row unchanged.

## Security Boundary

The gateway accepts only HTTP and HTTPS. Before every request and redirect it
resolves the hostname and rejects loopback, private, link-local, multicast,
unspecified, documentation, and cloud metadata address ranges. It also
enforces redirect, response-size, timeout, concurrent-request, and per-token
rate limits. URLs, Authorization headers, tokens, and response bodies are not
logged.

Runtime SQLite data can contain normalized proxy credentials. Protect the
self-hosted database file, do not commit it, and delete it when no longer
needed. Runtime snapshots and server credentials never enter Project Export.

The Runtime Service is not a public CORS proxy, account system, multi-user
backend, cloud platform, or third output target.

# ProxyFlow Runtime Service MVP

Status: V0.10 core with V1.0 RC5 deployment hardening

Runtime Service is an optional, self-hosted, single-user companion for
browser-limited subscription runtime work. Local Mode remains the default:
Projects, parsing, validation, compilation, export, and the browser's local
Last Known Good cache continue to work when the service is disconnected.

## Deployment Modes

Local Mode does not need this service. Project editing, validation, compilation,
export, and browser Last Known Good snapshots remain available without Docker,
an account, or a database server.

The recommended Self-hosted deployment packages the Web UI, Runtime API,
Subscription Fetcher, scheduler, and SQLite persistence in one container. It
uses one host port and one persistent data directory.

## Self-hosted Manager

Download and inspect the RC5 manager before running it:

```bash
curl -fL --output proxyflow.sh \
  https://raw.githubusercontent.com/kure29/ProxyFlow/main/scripts/proxyflow.sh
less proxyflow.sh
chmod +x proxyflow.sh
./proxyflow.sh install
```

The default address is `http://127.0.0.1:17870`. This uncommon port is bound
only to the host loopback interface. The browser discovers the same-instance
backend automatically and does not ask for a Runtime URL or API token.

The manager supports `install`, `update`, `start`, `stop`, `restart`, `status`,
`logs`, `backup`, `uninstall`, and `help`. Direct Compose usage defaults to the
immutable image `ghcr.io/kure29/proxyflow:1.0.0-rc.5`. Managed installs use
the `rc` channel, which maps to `ghcr.io/kure29/proxyflow:rc`.
`PROXYFLOW_PORT`,
`PROXYFLOW_HOME`, `PROXYFLOW_DATA_DIR`, `PROXYFLOW_BIND_ADDRESS`, and
`PROXYFLOW_IMAGE` are available for advanced deployments. The allow-listed
`PROXYFLOW_UPDATE_CHANNEL` values are `rc` and `stable`; `stable` maps to
`:latest`. An explicitly configured image remains pinned and is never replaced
by a managed channel.

The default paths are:

- deployment configuration: `~/.proxyflow`;
- persistent Runtime data: `~/.proxyflow/data`;
- timestamped backups: `~/.proxyflow/backups`.

`backup` briefly stops a running container to produce a consistent archive,
then starts it again. `update` creates a backup before pulling and recreating
the service. A normal `uninstall` removes the container and preserves data.
`uninstall --purge` requires an explicit interactive confirmation.

Browser-local Projects are not stored in the server data directory. Export
them separately from ProxyFlow. A Runtime backup covers SQLite snapshots,
schedules, and other server Runtime state only.

### One-time upgrade from the RC2 manager

Existing RC2 servers need one manager-script replacement so the saved
`PROXYFLOW_IMAGE_MANAGED=true` installation can move from the old immutable pin
to the `rc` channel. Run these commands as root only after the RC5 container
workflow has published both `:1.0.0-rc.5` and `:rc`:

```bash
manager_tmp="$(mktemp /tmp/proxyflow-manager.XXXXXX)"
curl -fL --output "${manager_tmp}" \
  https://raw.githubusercontent.com/kure29/ProxyFlow/main/scripts/proxyflow.sh
bash -n "${manager_tmp}"
install -m 0755 /root/proxyflow.sh /root/proxyflow.sh.rc.2.bak
install -m 0755 "${manager_tmp}" /root/proxyflow.sh
rm -f "${manager_tmp}"
/root/proxyflow.sh update
/root/proxyflow.sh status
```

The update creates the existing Runtime backup before pulling `:rc`, waits for
the new container health check, and then persists the managed channel. Later RC
images can be installed with `/root/proxyflow.sh update` alone. A saved
`PROXYFLOW_IMAGE_MANAGED=false` pin remains unchanged.

## 1Panel And Public Domains

For 1Panel, keep the default `127.0.0.1:17870` binding and configure the website
reverse proxy upstream as `http://127.0.0.1:17870`. Preserve `Host` and
`X-Forwarded-Proto`. There is no reason to open port `17870` in the public
firewall when 1Panel is the entry point.

Public domain access requires HTTPS and authentication or access control at the
reverse proxy. The automatically issued same-origin HttpOnly cookie protects
Runtime API calls from browser script access; it is not a multi-user login
system. ProxyFlow does not provision TLS certificates or public access control.

## Compose

The repository [Compose file](../compose.yaml) is the transparent layer used by
the manager. Advanced users may operate it directly after setting a strong
Runtime token and an absolute data path:

```bash
export PROXYFLOW_RUNTIME_TOKEN='replace-with-a-long-random-token'
export PROXYFLOW_DATA_DIR='/srv/proxyflow-data'
docker compose up -d
```

The container listens internally on `17870`; Compose binds it to
`127.0.0.1:17870` by default. Published images target `linux/amd64` and
`linux/arm64`.

## Manual Development Service

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
an exact browser origin, not a wildcard. The manual development listener is
`127.0.0.1:8787`; production Self-hosted uses the container contract above.

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
- `GET /health`: version plus Web, backend, and scheduler readiness without
  exposing runtime paths, credentials, or data;
- `GET /api/v1/self-hosted`: same-instance discovery and secure cookie bootstrap
  in Self-hosted mode.

Successful refreshes use the existing shared parser, snapshot quality rules,
diff, and Last Known Good semantics. Invalid or failed refreshes preserve the
active snapshot. A valid empty result requires explicit confirmation. Restoring
history creates a new active snapshot and leaves the historical row unchanged.

### Subscription request compatibility

URL sources can select one allow-listed request profile. The profile is provider
compatibility metadata and is independent of the Project's Primary Target:

| Profile | User-Agent |
| --- | --- |
| Auto | `Clash.Meta`, with bounded fallback to `mihomo`, `sing-box`, then `ProxyFlow-Runtime/1.0` only after HTTP 403 or 406 |
| Mihomo / Clash.Meta | `Clash.Meta` |
| sing-box | `sing-box` |
| Generic | `ProxyFlow-Runtime/1.0` |

The Runtime API validates this enum again before fetching. It does not accept
custom User-Agent values or arbitrary headers. Auto does not retry after a
successful response and does not switch identity for authentication failures,
rate limits, other HTTP failures, TLS or network errors, SSRF blocks, timeouts,
or cancellation. All fallback attempts share the original overall deadline and
the existing URL, DNS, redirect, and SSRF checks.

Local Mode stores the selected profile with the URL source, but browser-native
fetch cannot reliably set `User-Agent`; the profile is applied by Runtime
Service refreshes and schedules only.

## Security Boundary

The gateway accepts only HTTP and HTTPS. Before every request and redirect it
resolves the hostname and rejects loopback, private, link-local, multicast,
unspecified, documentation, and cloud metadata address ranges. It also
enforces redirect, response-size, timeout, concurrent-request, and per-token
rate limits. URLs, Authorization headers, tokens, and response bodies are not
logged.

The fetch transport advertises and decodes `gzip`, `deflate`, and Brotli (`br`)
using Node's built-in streaming zlib implementation. Both compressed wire bytes
and decoded bytes are independently bounded by the Subscription size limit.
Unknown or corrupt content encodings fail with a stable transport error instead
of reaching the subscription parser.

External Runtime connections keep Bearer-token authentication and an exact
allowed browser origin. Same-instance Self-hosted uses an HttpOnly,
`SameSite=Strict` cookie scoped to `/api/v1`; the server token never enters
JavaScript or Project storage. Same-origin mode does not disable SSRF checks,
request limits, or the existing semantic lifecycle.

Runtime SQLite data can contain normalized proxy credentials. Protect the
self-hosted database file, do not commit it, and delete it when no longer
needed. Runtime snapshots and server credentials never enter Project Export.

The Runtime Service is not a public CORS proxy, account system, multi-user
backend, cloud platform, or third output target.

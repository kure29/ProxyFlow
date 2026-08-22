#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROXYFLOW_SCRIPT_VERSION='1.0.0-rc.5'
readonly IMAGE_REPOSITORY='ghcr.io/kure29/proxyflow'
readonly DEFAULT_UPDATE_CHANNEL='rc'
readonly DEFAULT_PORT='17870'
readonly DEFAULT_BIND_ADDRESS='127.0.0.1'
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_COMPOSE="${SCRIPT_DIR}/../compose.yaml"

IMAGE_OVERRIDE_SET='false'
IMAGE_OVERRIDE_VALUE=''
if [[ "${PROXYFLOW_IMAGE+x}" == 'x' ]]; then
  IMAGE_OVERRIDE_SET='true'
  IMAGE_OVERRIDE_VALUE="${PROXYFLOW_IMAGE}"
fi
readonly IMAGE_OVERRIDE_SET IMAGE_OVERRIDE_VALUE

DOCKER_BIN="${PROXYFLOW_DOCKER_BIN:-docker}"
INSTALL_HOME="${PROXYFLOW_HOME:-${HOME:?HOME is required}/.proxyflow}"
ENV_FILE="${INSTALL_HOME}/.env"
COMPOSE_FILE="${INSTALL_HOME}/compose.yaml"
DATA_DIR=''
BACKUP_DIR=''
PORT=''
BIND_ADDRESS=''
IMAGE=''
IMAGE_MANAGED='true'
UPDATE_CHANNEL=''
RUNTIME_TOKEN=''
CONTAINER_UID=''
CONTAINER_GID=''

say() { printf '%s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() { printf 'Error: %s\n' "$1" >&2; exit "${2:-1}"; }

usage() {
  cat <<'EOF'
ProxyFlow Self-hosted manager

Usage:
  proxyflow.sh install
  proxyflow.sh update
  proxyflow.sh start
  proxyflow.sh stop
  proxyflow.sh restart
  proxyflow.sh status
  proxyflow.sh logs
  proxyflow.sh backup
  proxyflow.sh uninstall [--purge]
  proxyflow.sh help

Optional environment overrides:
  PROXYFLOW_PORT          Host port (default: 17870)
  PROXYFLOW_BIND_ADDRESS  Host bind address (default: 127.0.0.1)
  PROXYFLOW_HOME          Installation directory (default: ~/.proxyflow)
  PROXYFLOW_DATA_DIR      Persistent Runtime data directory
  PROXYFLOW_IMAGE         Pinned container image (disables managed updates)
  PROXYFLOW_UPDATE_CHANNEL  Managed channel: rc (default) or stable

Local Mode does not require this script, Docker, or a Runtime Service.
EOF
}

managed_image_for_channel() {
  case "$1" in
    rc) printf '%s:rc' "${IMAGE_REPOSITORY}" ;;
    stable) printf '%s:latest' "${IMAGE_REPOSITORY}" ;;
    *) die 'PROXYFLOW_UPDATE_CHANNEL must be rc or stable.' 64 ;;
  esac
}

read_config_value() {
  local expected="$1" line key value
  [[ -f "${ENV_FILE}" ]] || return 1
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -n "${line}" && "${line}" != \#* && "${line}" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "${key}" == "${expected}" ]]; then
      printf '%s' "${value}"
      return 0
    fi
  done < "${ENV_FILE}"
  return 1
}

resolve_settings() {
  local saved saved_managed saved_channel
  saved="$(read_config_value PROXYFLOW_PORT || true)"
  PORT="${PROXYFLOW_PORT:-${saved:-${DEFAULT_PORT}}}"
  saved="$(read_config_value PROXYFLOW_BIND_ADDRESS || true)"
  BIND_ADDRESS="${PROXYFLOW_BIND_ADDRESS:-${saved:-${DEFAULT_BIND_ADDRESS}}}"
  saved="$(read_config_value PROXYFLOW_IMAGE || true)"
  saved_managed="$(read_config_value PROXYFLOW_IMAGE_MANAGED || true)"
  saved_channel="$(read_config_value PROXYFLOW_UPDATE_CHANNEL || true)"
  UPDATE_CHANNEL="${PROXYFLOW_UPDATE_CHANNEL:-${saved_channel:-${DEFAULT_UPDATE_CHANNEL}}}"
  if [[ "${IMAGE_OVERRIDE_SET}" == 'true' ]]; then
    IMAGE="${IMAGE_OVERRIDE_VALUE}"
    IMAGE_MANAGED='false'
  elif [[ "${saved_managed}" == 'false' && -n "${saved}" ]]; then
    IMAGE="${saved}"
    IMAGE_MANAGED='false'
  else
    IMAGE="$(managed_image_for_channel "${UPDATE_CHANNEL}")"
    IMAGE_MANAGED='true'
  fi
  saved="$(read_config_value PROXYFLOW_DATA_DIR || true)"
  DATA_DIR="${PROXYFLOW_DATA_DIR:-${saved:-${INSTALL_HOME}/data}}"
  BACKUP_DIR="${INSTALL_HOME}/backups"
  RUNTIME_TOKEN="$(read_config_value PROXYFLOW_RUNTIME_TOKEN || true)"
  CONTAINER_UID="$(read_config_value PROXYFLOW_UID || true)"
  CONTAINER_GID="$(read_config_value PROXYFLOW_GID || true)"
  CONTAINER_UID="${CONTAINER_UID:-$(id -u)}"
  CONTAINER_GID="${CONTAINER_GID:-$(id -g)}"
  validate_settings
  export PROXYFLOW_PORT="${PORT}"
  export PROXYFLOW_BIND_ADDRESS="${BIND_ADDRESS}"
  export PROXYFLOW_IMAGE="${IMAGE}"
  export PROXYFLOW_DATA_DIR="${DATA_DIR}"
  export PROXYFLOW_RUNTIME_TOKEN="${RUNTIME_TOKEN}"
  export PROXYFLOW_UID="${CONTAINER_UID}"
  export PROXYFLOW_GID="${CONTAINER_GID}"
}

validate_settings() {
  [[ "${INSTALL_HOME}" == /* ]] || die 'PROXYFLOW_HOME must be an absolute path.' 64
  [[ "${DATA_DIR}" == /* ]] || die 'PROXYFLOW_DATA_DIR must be an absolute path.' 64
  [[ "${PORT}" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) || die 'PROXYFLOW_PORT must be an integer from 1 to 65535.' 64
  [[ "${BIND_ADDRESS}" =~ ^[A-Za-z0-9.:_-]+$ ]] || die 'PROXYFLOW_BIND_ADDRESS contains unsupported characters.' 64
  [[ "${IMAGE}" =~ ^[A-Za-z0-9._/:@-]+$ ]] || die 'PROXYFLOW_IMAGE contains unsupported characters.' 64
  [[ "${UPDATE_CHANNEL}" == 'rc' || "${UPDATE_CHANNEL}" == 'stable' ]] || die 'PROXYFLOW_UPDATE_CHANNEL must be rc or stable.' 64
  reject_multiline PROXYFLOW_HOME "${INSTALL_HOME}"
  reject_multiline PROXYFLOW_DATA_DIR "${DATA_DIR}"
}

reject_multiline() {
  local name="$1" value="$2"
  [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] || die "${name} must not contain newlines." 64
}

require_docker() {
  command -v "${DOCKER_BIN}" >/dev/null 2>&1 || die 'Docker is not installed. Install Docker Engine or Docker Desktop, then run this command again.'
  "${DOCKER_BIN}" info >/dev/null 2>&1 || die 'Docker is installed, but the Docker daemon is unavailable. Start Docker and try again.'
  "${DOCKER_BIN}" compose version >/dev/null 2>&1 || die 'Docker Compose v2 is required. Install or enable the Docker Compose plugin.'
}

require_installation() {
  [[ -f "${ENV_FILE}" && -f "${COMPOSE_FILE}" ]] || die "ProxyFlow is not installed in ${INSTALL_HOME}. Run: $0 install"
}

compose() {
  "${DOCKER_BIN}" compose --project-name proxyflow --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

generate_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  command -v od >/dev/null 2>&1 || die 'Neither openssl nor od is available to generate a secure Runtime token.'
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

write_environment() {
  local token="${RUNTIME_TOKEN:-$(generate_token)}"
  umask 077
  {
    printf 'PROXYFLOW_IMAGE=%s\n' "${IMAGE}"
    printf 'PROXYFLOW_IMAGE_MANAGED=%s\n' "${IMAGE_MANAGED}"
    printf 'PROXYFLOW_UPDATE_CHANNEL=%s\n' "${UPDATE_CHANNEL}"
    printf 'PROXYFLOW_PORT=%s\n' "${PORT}"
    printf 'PROXYFLOW_BIND_ADDRESS=%s\n' "${BIND_ADDRESS}"
    printf 'PROXYFLOW_DATA_DIR=%s\n' "${DATA_DIR}"
    printf 'PROXYFLOW_RUNTIME_TOKEN=%s\n' "${token}"
    printf 'PROXYFLOW_UID=%s\n' "${CONTAINER_UID}"
    printf 'PROXYFLOW_GID=%s\n' "${CONTAINER_GID}"
  } > "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  RUNTIME_TOKEN="${token}"
  export PROXYFLOW_RUNTIME_TOKEN="${RUNTIME_TOKEN}"
}

write_compose() {
  if [[ -f "${REPOSITORY_COMPOSE}" ]]; then
    cp "${REPOSITORY_COMPOSE}" "${COMPOSE_FILE}"
    return
  fi
  cat > "${COMPOSE_FILE}" <<'EOF'
name: proxyflow

services:
  proxyflow:
    image: ${PROXYFLOW_IMAGE:-ghcr.io/kure29/proxyflow:1.0.0-rc.5}
    restart: unless-stopped
    init: true
    user: "${PROXYFLOW_UID:-1000}:${PROXYFLOW_GID:-1000}"
    ports:
      - "${PROXYFLOW_BIND_ADDRESS:-127.0.0.1}:${PROXYFLOW_PORT:-17870}:17870"
    environment:
      PORT: "17870"
      PROXYFLOW_RUNTIME_HOST: "0.0.0.0"
      PROXYFLOW_RUNTIME_DB: "/data/proxyflow-runtime.sqlite"
      PROXYFLOW_RUNTIME_TOKEN: "${PROXYFLOW_RUNTIME_TOKEN:?Set PROXYFLOW_RUNTIME_TOKEN}"
      PROXYFLOW_WEB_ROOT: "/app/dist"
      PROXYFLOW_SELF_HOSTED: "true"
    volumes:
      - "${PROXYFLOW_DATA_DIR:?Set PROXYFLOW_DATA_DIR}:/data"
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:17870/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]
      interval: 15s
      timeout: 3s
      start_period: 10s
      retries: 4
EOF
}

port_in_use() {
  [[ "${PROXYFLOW_SKIP_PORT_CHECK:-0}" == '1' ]] && return 1
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | awk '{print $4}' | grep -Eq "(^|:)$PORT$"
    return
  fi
  return 1
}

health_body() {
  local url="http://127.0.0.1:${PORT}/health"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --max-time 3 "${url}"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=3 "${url}"
    return
  fi
  compose exec -T proxyflow node -e "fetch('http://127.0.0.1:17870/health').then(async (response) => { if (!response.ok) process.exit(1); process.stdout.write(await response.text()) }).catch(() => process.exit(1))"
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 30); do
    if health_body >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

running_version() {
  local body version
  body="$(health_body 2>/dev/null)" || return 1
  version="$(printf '%s' "${body}" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  [[ -n "${version}" ]] || return 1
  printf '%s' "${version}"
}

access_url() {
  printf 'http://127.0.0.1:%s' "${PORT}"
}

install_proxyflow() {
  resolve_settings
  require_docker
  if [[ ! -f "${ENV_FILE}" ]] && port_in_use; then
    die "Port ${PORT} is already in use. Set PROXYFLOW_PORT to another port and try again."
  fi
  mkdir -p "${INSTALL_HOME}" "${DATA_DIR}" "${BACKUP_DIR}"
  write_environment
  write_compose
  say "Pulling ${IMAGE}..."
  compose pull proxyflow || die 'The ProxyFlow image could not be pulled. Existing data was not changed.'
  compose up -d --remove-orphans proxyflow
  if ! wait_for_health; then
    compose logs --tail 80 proxyflow >&2 || true
    die 'ProxyFlow started but did not become healthy. Data was preserved; inspect logs with: proxyflow.sh logs'
  fi
  say 'ProxyFlow is ready.'
  say "Open: $(access_url)"
  say "Data: ${DATA_DIR}"
  say 'Next: proxyflow.sh status | logs | backup | update'
  if [[ "${BIND_ADDRESS}" == '0.0.0.0' || "${BIND_ADDRESS}" == '::' ]]; then
    warn 'ProxyFlow is listening beyond localhost. Use HTTPS and access control before exposing it to the public Internet.'
  fi
}

backup_data() {
  resolve_settings
  require_installation
  require_docker
  mkdir -p "${DATA_DIR}" "${BACKUP_DIR}"
  local timestamp archive running='false' tar_status=0
  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  archive="${BACKUP_DIR}/proxyflow-runtime-${timestamp}.tar.gz"
  if [[ -n "$(compose ps --status running -q proxyflow 2>/dev/null || true)" ]]; then
    running='true'
    compose stop proxyflow
  fi
  if tar -czf "${archive}" -C "${DATA_DIR}" .; then
    tar_status=0
  else
    tar_status=$?
  fi
  if [[ "${running}" == 'true' ]]; then
    compose start proxyflow
    wait_for_health || warn 'The previous service did not become healthy after the backup.'
  fi
  (( tar_status == 0 )) || die 'Backup failed. The previous service was restarted and existing data was preserved.'
  say "Backup: ${archive}"
  say 'Browser-local Projects are not included; export them separately from ProxyFlow.'
}

update_proxyflow() {
  resolve_settings
  require_installation
  require_docker
  local previous_version current_version update_label
  previous_version="$(running_version || true)"
  previous_version="${previous_version:-Unknown}"
  if [[ "${IMAGE_MANAGED}" == 'true' ]]; then
    update_label="${UPDATE_CHANNEL}"
  else
    update_label='manual pin'
  fi
  say "Current version: ${previous_version}"
  say "Update channel: ${update_label}"
  say "Pulling: ${IMAGE}"
  backup_data
  write_compose
  compose pull proxyflow || die 'Update pull failed. The previous service remains available and the backup was preserved.'
  compose up -d --remove-orphans proxyflow
  if ! wait_for_health; then
    compose logs --tail 80 proxyflow >&2 || true
    die 'The updated service is not healthy. Data and the pre-update backup were preserved; use the recorded image tag to restore the previous container.'
  fi
  write_environment
  current_version="$(running_version || true)"
  current_version="${current_version:-Unknown}"
  say 'ProxyFlow update completed.'
  say "Previous version: ${previous_version}"
  say "Current version: ${current_version}"
  if [[ "${IMAGE_MANAGED}" == 'true' && "${previous_version}" != 'Unknown' && "${previous_version}" == "${current_version}" ]]; then
    say "Already running the latest available ${UPDATE_CHANNEL} release."
  fi
}

start_proxyflow() {
  resolve_settings
  require_installation
  require_docker
  compose up -d proxyflow
  wait_for_health || die 'ProxyFlow did not become healthy. Run: proxyflow.sh logs'
  say "ProxyFlow is ready at $(access_url)"
}

stop_proxyflow() {
  resolve_settings
  require_installation
  require_docker
  compose stop proxyflow
  say 'ProxyFlow stopped. Persistent data was preserved.'
}

restart_proxyflow() {
  resolve_settings
  require_installation
  require_docker
  compose restart proxyflow
  wait_for_health || die 'ProxyFlow did not become healthy after restart. Run: proxyflow.sh logs'
  say "ProxyFlow restarted at $(access_url)"
}

status_proxyflow() {
  resolve_settings
  require_installation
  require_docker
  local running body version
  running="$(compose ps --status running -q proxyflow 2>/dev/null || true)"
  if [[ -z "${running}" ]]; then
    say 'ProxyFlow: Stopped'
    say 'Web: Unavailable'
    say 'Backend: Unavailable'
    say "Data: ${DATA_DIR}"
    return 1
  fi
  say 'ProxyFlow: Running'
  if body="$(health_body 2>/dev/null)"; then
    version="$(printf '%s' "${body}" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
    say "Version: ${version:-${PROXYFLOW_SCRIPT_VERSION}}"
    say 'Web: Healthy'
    say 'Backend: Healthy'
    say 'Scheduler: Available'
  else
    say 'Version: Unknown'
    say 'Web: Unhealthy'
    say 'Backend: Unhealthy'
    say 'Scheduler: Unknown'
    return 1
  fi
  say "Data: ${DATA_DIR}"
}

logs_proxyflow() {
  resolve_settings
  require_installation
  require_docker
  local lines="${PROXYFLOW_LOG_LINES:-100}"
  [[ "${lines}" =~ ^[0-9]+$ ]] || die 'PROXYFLOW_LOG_LINES must be a non-negative integer.' 64
  compose logs --tail "${lines}" -f proxyflow
}

safe_remove_path() {
  local target="$1"
  [[ -n "${target}" && "${target}" == /* && "${target}" != '/' && "${target}" != "${HOME}" ]] || die "Refusing to remove unsafe path: ${target}"
  rm -rf -- "${target}"
}

uninstall_proxyflow() {
  local purge="${1:-}"
  [[ -z "${purge}" || "${purge}" == '--purge' ]] || die 'Usage: proxyflow.sh uninstall [--purge]' 64
  resolve_settings
  require_installation
  require_docker
  compose down --remove-orphans
  if [[ "${purge}" != '--purge' ]]; then
    say 'ProxyFlow containers were removed. Data was preserved.'
    say "Data: ${DATA_DIR}"
    say "Backups: ${BACKUP_DIR}"
    return
  fi
  if [[ "${PROXYFLOW_CONFIRM_PURGE:-}" != 'DELETE' ]]; then
    [[ -t 0 ]] || die 'Purge requires an interactive confirmation. Re-run in a terminal.'
    local answer
    read -r -p "Delete ProxyFlow data and backups at ${INSTALL_HOME}? Type DELETE: " answer
    [[ "${answer}" == 'DELETE' ]] || die 'Purge cancelled.'
  fi
  if [[ "${DATA_DIR}" != "${INSTALL_HOME}" && "${DATA_DIR}" != "${INSTALL_HOME}/"* ]]; then safe_remove_path "${DATA_DIR}"; fi
  safe_remove_path "${INSTALL_HOME}"
  say 'ProxyFlow containers, Runtime data, and local backups were deleted.'
}

main() {
  local command="${1:-help}"
  shift || true
  case "${command}" in
    install) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh install' 64; install_proxyflow ;;
    update) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh update' 64; update_proxyflow ;;
    start) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh start' 64; start_proxyflow ;;
    stop) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh stop' 64; stop_proxyflow ;;
    restart) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh restart' 64; restart_proxyflow ;;
    status) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh status' 64; status_proxyflow ;;
    logs) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh logs' 64; logs_proxyflow ;;
    backup) [[ $# -eq 0 ]] || die 'Usage: proxyflow.sh backup' 64; backup_data ;;
    uninstall) [[ $# -le 1 ]] || die 'Usage: proxyflow.sh uninstall [--purge]' 64; uninstall_proxyflow "${1:-}" ;;
    help|-h|--help) usage ;;
    *) usage >&2; die "Unknown command: ${command}" 64 ;;
  esac
}

main "$@"

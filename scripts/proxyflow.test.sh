#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT="${TEST_DIR}/proxyflow.sh"
readonly REPOSITORY_COMPOSE="${TEST_DIR}/../compose.yaml"
readonly TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/proxyflow-deployment-test.XXXXXX")"

TESTS=0
OUTPUT=''
STATUS=0

cleanup() { rm -rf -- "${TEMP_ROOT}"; }
trap cleanup EXIT

fail() {
  printf 'not ok %d - %s\n' "$((TESTS + 1))" "$1" >&2
  [[ -z "${OUTPUT}" ]] || printf '%s\n' "${OUTPUT}" >&2
  exit 1
}

pass() {
  TESTS=$((TESTS + 1))
  printf 'ok %d - %s\n' "${TESTS}" "$1"
}

assert_status() {
  [[ "${STATUS}" -eq "$1" ]] || fail "$2 (expected status $1, got ${STATUS})"
}

assert_output() {
  [[ "${OUTPUT}" == *"$1"* ]] || fail "$2 (missing: $1)"
}

assert_file_contains() {
  grep -Fqx -- "$2" "$1" || fail "$3 (missing line: $2)"
}

run_script() {
  set +e
  OUTPUT="$("$@" 2>&1)"
  STATUS=$?
  set -e
}

make_mocks() {
  local bin_dir="$1"
  mkdir -p "${bin_dir}"
  cat > "${bin_dir}/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${MOCK_DOCKER_LOG:?}"
{
  printf 'docker'
  printf ' %q' "$@"
  printf '\n'
} >> "${MOCK_DOCKER_LOG}"

if [[ "${1:-}" == 'info' ]]; then
  [[ "${MOCK_DOCKER_INFO_FAIL:-0}" != '1' ]]
  exit
fi

if [[ "${1:-}" == 'compose' && "${2:-}" == 'version' ]]; then
  [[ "${MOCK_COMPOSE_FAIL:-0}" != '1' ]]
  exit
fi

joined=" $* "
if [[ "${joined}" == *' ps --status running -q proxyflow '* ]]; then
  [[ "${MOCK_RUNNING:-1}" == '1' ]] && printf '%s\n' 'fictional-container-id'
  exit
fi
if [[ "${joined}" == *' pull proxyflow '* && "${MOCK_PULL_FAIL:-0}" == '1' ]]; then exit 1; fi
if [[ "${joined}" == *' logs '* ]]; then printf '%s\n' 'fictional log line'; fi
EOF
  cat > "${bin_dir}/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${MOCK_HEALTH_FAIL:-0}" != '1' ]] || exit 22
printf '%s\n' '{"ok":true,"service":"proxyflow-runtime","version":"1.0.0-rc.2","web":"ready","backend":"ready","scheduler":"ready"}'
EOF
  cat > "${bin_dir}/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${bin_dir}/docker" "${bin_dir}/curl" "${bin_dir}/sleep"
}

run_managed() {
  local install_home="$1"
  local data_dir="$2"
  shift 2
  run_script env \
    PATH="${MOCK_BIN}:${PATH}" \
    MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" \
    PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" \
    PROXYFLOW_HOME="${install_home}" \
    PROXYFLOW_DATA_DIR="${data_dir}" \
    PROXYFLOW_SKIP_PORT_CHECK=1 \
    "$@" "${SCRIPT}"
}

bash -n "${SCRIPT}" "${BASH_SOURCE[0]}" || fail 'Bash syntax is valid'
[[ -x "${SCRIPT}" && -x "${BASH_SOURCE[0]}" ]] || fail 'Deployment scripts are executable'
pass 'Bash syntax and executable bits are valid'

run_script "${SCRIPT}"
assert_status 0 'No-argument help succeeds'
assert_output 'default: 17870' 'Help documents the uncommon default port'
assert_output 'Local Mode does not require this script' 'Help preserves Local Mode'
pass 'No arguments show deployment help'

run_script "${SCRIPT}" unsupported
assert_status 64 'Unknown commands fail with usage status'
assert_output 'Unknown command: unsupported' 'Unknown command is explained'
pass 'Invalid commands fail closed'

run_script env PROXYFLOW_DOCKER_BIN="${TEMP_ROOT}/missing-docker" PROXYFLOW_HOME="${TEMP_ROOT}/missing-home" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/missing-data" "${SCRIPT}" install
assert_status 1 'Missing Docker blocks install'
assert_output 'Docker is not installed' 'Missing Docker has an actionable message'
pass 'Missing Docker is detected'

MOCK_BIN="${TEMP_ROOT}/mock bin"
MOCK_DOCKER_LOG="${TEMP_ROOT}/docker.log"
make_mocks "${MOCK_BIN}"
: > "${MOCK_DOCKER_LOG}"

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_DOCKER_INFO_FAIL=1 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${TEMP_ROOT}/daemon-home" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/daemon-data" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" install
assert_status 1 'Unavailable daemon blocks install'
assert_output 'Docker daemon is unavailable' 'Unavailable daemon has an actionable message'
pass 'Unavailable Docker daemon is detected'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_COMPOSE_FAIL=1 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${TEMP_ROOT}/compose-home" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/compose-data" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" install
assert_status 1 'Missing Compose v2 blocks install'
assert_output 'Docker Compose v2 is required' 'Missing Compose v2 has an actionable message'
pass 'Docker Compose v2 capability is checked'

INSTALL_HOME="${TEMP_ROOT}/install home"
DATA_DIR="${TEMP_ROOT}/runtime data"
run_script env \
  PATH="${MOCK_BIN}:${PATH}" \
  MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" \
  PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" \
  PROXYFLOW_HOME="${INSTALL_HOME}" \
  PROXYFLOW_DATA_DIR="${DATA_DIR}" \
  PROXYFLOW_PORT=28431 \
  PROXYFLOW_IMAGE='ghcr.io/example/proxyflow:fictional' \
  PROXYFLOW_SKIP_PORT_CHECK=1 \
  "${SCRIPT}" install
assert_status 0 'Install succeeds with mocked Docker'
assert_output 'http://127.0.0.1:28431' 'Install prints the overridden access address'
[[ -d "${DATA_DIR}" && -d "${INSTALL_HOME}/backups" ]] || fail 'Install creates persistent directories'
[[ "$(stat -f '%Lp' "${INSTALL_HOME}/.env" 2>/dev/null || stat -c '%a' "${INSTALL_HOME}/.env")" == '600' ]] || fail 'Install protects the environment file'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_PORT=28431' 'Install persists the port override'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/example/proxyflow:fictional' 'Install persists the image override'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=false' 'Install preserves an explicit image pin'
assert_file_contains "${INSTALL_HOME}/.env" "PROXYFLOW_DATA_DIR=${DATA_DIR}" 'Install preserves a data path with spaces'
cmp "${REPOSITORY_COMPOSE}" "${INSTALL_HOME}/compose.yaml" >/dev/null || fail 'Install uses the repository Compose contract'
pass 'Install handles explicit paths, image, and port overrides'

printf '%s\n' 'fictional runtime state' > "${DATA_DIR}/state.txt"
for command in start status restart stop logs; do
  run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" "${command}"
  assert_status 0 "${command} succeeds with mocked Docker"
done
assert_output 'fictional log line' 'Logs are delegated to Compose'
pass 'Start, status, restart, stop, and logs use the managed Compose stack'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" backup
assert_status 0 'Backup succeeds'
assert_output 'Browser-local Projects are not included' 'Backup explains the browser Project boundary'
BACKUP_COUNT="$(find "${INSTALL_HOME}/backups" -maxdepth 1 -name 'proxyflow-runtime-*.tar.gz' | wc -l | tr -d ' ')"
[[ "${BACKUP_COUNT}" -eq 1 ]] || fail 'Backup creates one timestamped archive'
pass 'Backup archives persistent Runtime data with a timestamp'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" update
assert_status 0 'Update succeeds'
assert_output 'ProxyFlow update completed' 'Update reports completion after backup and health check'
pass 'Update backs up and recreates the managed service'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" uninstall extra argument
assert_status 64 'Uninstall rejects extra arguments'
assert_output 'Usage: proxyflow.sh uninstall [--purge]' 'Uninstall documents accepted arguments'
pass 'Uninstall rejects ambiguous arguments'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" uninstall
assert_status 0 'Default uninstall succeeds'
assert_output 'Data was preserved' 'Default uninstall reports data preservation'
[[ -f "${DATA_DIR}/state.txt" ]] || fail 'Default uninstall must preserve Runtime data'
pass 'Default uninstall removes containers and preserves data'

run_script env PROXYFLOW_PORT=70000 PROXYFLOW_HOME="${TEMP_ROOT}/invalid-home" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/invalid-data" "${SCRIPT}" install
assert_status 64 'Invalid port is rejected before Docker checks'
assert_output 'PROXYFLOW_PORT must be an integer from 1 to 65535' 'Invalid port has a bounded validation message'
pass 'Invalid ports fail closed'

STANDALONE_DIR="${TEMP_ROOT}/standalone"
mkdir -p "${STANDALONE_DIR}"
cp "${SCRIPT}" "${STANDALONE_DIR}/proxyflow.sh"
chmod +x "${STANDALONE_DIR}/proxyflow.sh"
STANDALONE_HOME="${TEMP_ROOT}/standalone home"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STANDALONE_HOME}" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/standalone data" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" install
assert_status 0 'Standalone install succeeds without repository files'
cmp "${REPOSITORY_COMPOSE}" "${STANDALONE_HOME}/compose.yaml" >/dev/null || fail 'Embedded Compose must match repository Compose semantics'
pass 'Standalone script embeds the same Compose contract'

assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Default install marks the image as script-managed'
sed 's/1\.0\.0-rc\.2/1.0.0-rc.3/g' "${STANDALONE_DIR}/proxyflow.sh" > "${STANDALONE_DIR}/proxyflow-next.sh"
chmod +x "${STANDALONE_DIR}/proxyflow-next.sh"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STANDALONE_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow-next.sh" update
assert_status 0 'A future manager can update a managed image'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:1.0.0-rc.3' 'Managed image follows the future manager version'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Managed image remains managed after update'
pass 'Managed images advance while explicit image pins remain stable'

FAIL_BIN="${TEMP_ROOT}/fail bin"
mkdir -p "${FAIL_BIN}"
cat > "${FAIL_BIN}/tar" <<'EOF'
#!/usr/bin/env bash
exit 42
EOF
chmod +x "${FAIL_BIN}/tar"
: > "${MOCK_DOCKER_LOG}"
run_script env PATH="${FAIL_BIN}:${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" backup
assert_status 1 'Failed archive blocks backup'
assert_output 'Backup failed' 'Failed archive has a recovery-oriented message'
grep -F ' stop proxyflow' "${MOCK_DOCKER_LOG}" >/dev/null || fail 'Backup failure stops a running service before archiving'
grep -F ' start proxyflow' "${MOCK_DOCKER_LOG}" >/dev/null || fail 'Backup failure restarts the previous service'
pass 'Backup failure is detected and the previous service is restarted'

printf '1..%d\n' "${TESTS}"

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

assert_output_not_contains() {
  [[ "${OUTPUT}" != *"$1"* ]] || fail "$2 (unexpected: $1)"
}

assert_output_count_at_least() {
  local actual
  actual="$(printf '%s' "${OUTPUT}" | grep -F -c -- "$1" || true)"
  (( actual >= $2 )) || fail "$3 (expected at least $2 occurrences of: $1; got ${actual})"
}

assert_file_contains() {
  grep -Fqx -- "$2" "$1" || fail "$3 (missing line: $2)"
}

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
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
  exit 0
fi
if [[ "${joined}" == *' pull proxyflow '* && "${MOCK_PULL_FAIL:-0}" == '1' ]]; then exit 1; fi
if [[ "${joined}" == *' pull proxyflow '* && -n "${MOCK_PULLED_MARKER:-}" ]]; then touch "${MOCK_PULLED_MARKER}"; fi
if [[ "${joined}" == *' logs '* ]]; then printf '%s\n' 'fictional log line'; fi
EOF
  cat > "${bin_dir}/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${MOCK_HEALTH_FAIL:-0}" != '1' ]] || exit 22
version="${MOCK_HEALTH_VERSION_BEFORE:-1.3.0}"
if [[ -n "${MOCK_PULLED_MARKER:-}" && -f "${MOCK_PULLED_MARKER}" ]]; then version="${MOCK_HEALTH_VERSION_AFTER:-${version}}"; fi
printf '{"ok":true,"service":"proxyflow-runtime","version":"%s","web":"ready","backend":"ready","scheduler":"ready"}\n' "${version}"
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

MENU_TEST_HOME=''
MENU_TEST_DATA=''
MENU_TEST_RUNNING='1'
MENU_TEST_DOCKER_INFO_FAIL='0'
MENU_TEST_VERSION='1.3.0'
MENU_TEST_DOCKER_BIN=''

run_interactive_menu() {
  local input="$1" mode="${2:-default}"
  local menu_home="${MENU_TEST_HOME:-${TEMP_ROOT}/interactive home}"
  local menu_data="${MENU_TEST_DATA:-${TEMP_ROOT}/interactive data}"
  set +e
  OUTPUT="$(printf '%s' "${input}" | env \
    PATH="${MOCK_BIN}:${PATH}" \
    MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" \
    MOCK_DOCKER_INFO_FAIL="${MENU_TEST_DOCKER_INFO_FAIL}" \
    MOCK_RUNNING="${MENU_TEST_RUNNING}" \
    MOCK_HEALTH_VERSION_BEFORE="${MENU_TEST_VERSION}" \
    PROXYFLOW_DOCKER_BIN="${MENU_TEST_DOCKER_BIN:-${MOCK_BIN}/docker}" \
    PROXYFLOW_HOME="${menu_home}" \
    PROXYFLOW_DATA_DIR="${menu_data}" \
    PROXYFLOW_SKIP_PORT_CHECK=1 \
    PROXYFLOW_TEST_MENU_MODE="${mode}" \
    bash -c '
      source "$1"
      has_interactive_input() { return 0; }
      is_interactive_terminal() { return 0; }
      if [[ "${PROXYFLOW_TEST_MENU_MODE}" == "logs-interrupt" ]]; then
        logs_proxyflow() { kill -INT "${PPID}"; return 130; }
      fi
      main
    ' _ "${SCRIPT}" 2>&1)"
  STATUS=$?
  set -e
}

bash -n "${SCRIPT}" "${BASH_SOURCE[0]}" || fail 'Bash syntax is valid'
[[ -x "${SCRIPT}" && -x "${BASH_SOURCE[0]}" ]] || fail 'Deployment scripts are executable'
pass 'Bash syntax and executable bits are valid'

run_script "${SCRIPT}"
assert_status 0 'No-argument non-TTY usage succeeds'
assert_output 'default: 17870' 'Help documents the uncommon default port'
assert_output 'Managed channel: stable (default) or rc' 'Help documents bounded update channels'
assert_output 'Local Mode does not require this script' 'Help preserves Local Mode'
assert_output 'Without a TTY, the manager prints this usage' 'Help explains non-interactive no-argument behavior'
pass 'No arguments without a TTY show usage without waiting'

run_script "${SCRIPT}" help
assert_status 0 'Explicit help succeeds'
assert_output_not_contains 'ProxyFlow Manager v1.3.0' 'Explicit subcommands do not enter the menu'
pass 'Explicit subcommands bypass the interactive menu'

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

MENU_TEST_HOME="${TEMP_ROOT}/menu not installed"
MENU_TEST_DATA="${TEMP_ROOT}/menu not installed data"
run_interactive_menu $'0\n'
assert_status 0 'TTY no-argument menu exits with zero'
assert_output 'ProxyFlow Manager v1.3.0' 'TTY no-argument execution opens the manager'
assert_output '状态：Not installed' 'The menu reports a missing installation'
assert_output '0. 退出' 'The menu includes an explicit exit action'
pass 'No arguments with a TTY open the interactive menu'

run_interactive_menu $'q\n'
assert_status 0 'q exits the menu with zero'
run_interactive_menu $'Q\n'
assert_status 0 'Q exits the menu with zero'
pass 'The menu accepts zero and q or Q to exit'

run_interactive_menu $'invalid\n\n0\n'
assert_status 0 'An invalid choice does not terminate the menu'
assert_output '无效选择，请输入 0-9。' 'An invalid choice is explained'
assert_output_count_at_least 'ProxyFlow Manager v1.3.0' 2 'An invalid choice returns to the menu loop'
pass 'Invalid menu choices return to the menu'

run_interactive_menu $'2\n\n0\n'
assert_status 0 'Unavailable actions do not terminate an uninstalled menu'
assert_output 'ProxyFlow 尚未安装' 'Uninstalled actions direct the user to Install'
assert_output_count_at_least 'ProxyFlow Manager v1.3.0' 2 'Uninstalled actions return to the menu'
pass 'Not-installed actions remain inside the interactive manager'

MENU_TEST_DOCKER_BIN="${TEMP_ROOT}/missing-menu-docker"
run_interactive_menu $'0\n'
assert_status 0 'The menu remains available without Docker'
assert_output '状态：Not installed' 'A missing installation remains distinguishable from Docker state'
assert_output 'Docker：Unavailable' 'The menu reports Docker as unavailable without exiting'
MENU_TEST_DOCKER_BIN=''
pass 'Menu status probing tolerates missing Docker'

run_script env PROXYFLOW_DOCKER_BIN="${TEMP_ROOT}/missing-menu-docker" PROXYFLOW_HOME="${TEMP_ROOT}/missing-menu-home" "${SCRIPT}"
assert_status 0 'Non-TTY no-argument usage does not require Docker'
assert_output_not_contains 'Docker is not installed' 'Usage rendering does not probe Docker'
pass 'Non-interactive usage is independent of Docker availability'

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
  PROXYFLOW_IMAGE='ghcr.io/kure29/proxyflow:1.0.0-rc.5' \
  PROXYFLOW_SKIP_PORT_CHECK=1 \
  "${SCRIPT}" install
assert_status 0 'Install succeeds with mocked Docker'
assert_output 'http://127.0.0.1:28431' 'Install prints the overridden access address'
[[ -d "${DATA_DIR}" && -d "${INSTALL_HOME}/backups" ]] || fail 'Install creates persistent directories'
[[ "$(file_mode "${INSTALL_HOME}/.env")" == '600' ]] || fail 'Install protects the environment file'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_PORT=28431' 'Install persists the port override'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:1.0.0-rc.5' 'Install persists the RC5 image override'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=false' 'Install preserves an explicit image pin'
assert_file_contains "${INSTALL_HOME}/.env" "PROXYFLOW_DATA_DIR=${DATA_DIR}" 'Install preserves a data path with spaces'
cmp "${REPOSITORY_COMPOSE}" "${INSTALL_HOME}/compose.yaml" >/dev/null || fail 'Install uses the repository Compose contract'
pass 'Install handles explicit paths, image, and port overrides'

MENU_TEST_HOME="${INSTALL_HOME}"
MENU_TEST_DATA="${DATA_DIR}"
MENU_TEST_RUNNING='1'
MENU_TEST_VERSION='1.3.0'
run_interactive_menu $'0\n'
assert_status 0 'An installed manager menu renders successfully'
assert_output '状态：Running' 'The menu reports a running container'
assert_output '版本：1.3.0' 'The menu reads the running version best-effort'
assert_output '更新通道：manual pin' 'The menu identifies an explicit image pin'
assert_output '端口：28431' 'The menu reads the installed port'
pass 'Menu status reports running version and manual pin state'

MENU_TEST_RUNNING='0'
run_interactive_menu $'6\n\n0\n'
assert_status 0 'A stopped status does not terminate the manager'
assert_output '状态：Stopped' 'The menu reports a stopped container'
assert_output 'ProxyFlow: Stopped' 'The existing status action still reports stopped state'
assert_output '操作未完成（退出码 1）' 'The menu contains the stopped status exit code'
assert_output_count_at_least 'ProxyFlow Manager v1.3.0' 2 'Stopped status returns to the menu'
pass 'Stopped status stays inside the menu loop'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_RUNNING=0 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" status
assert_status 1 'CLI status preserves its stopped exit code'
assert_output 'ProxyFlow: Stopped' 'CLI status keeps the existing stopped output'
pass 'CLI status failure semantics remain unchanged'

MENU_TEST_RUNNING='1'
MENU_TEST_DOCKER_INFO_FAIL='1'
run_interactive_menu $'3\n\n0\n'
assert_status 0 'An action failure does not terminate the manager'
assert_output '状态：Unavailable' 'An installed menu reports unavailable Docker state'
assert_output 'Docker daemon is unavailable' 'The existing action failure remains actionable'
assert_output_count_at_least 'ProxyFlow Manager v1.3.0' 2 'Action failure returns to the menu'
MENU_TEST_DOCKER_INFO_FAIL='0'
pass 'Interactive action failures are contained without changing CLI errors'

run_interactive_menu $'7\n0\n' logs-interrupt
assert_status 0 'Interrupting interactive logs returns successfully'
assert_output '实时日志' 'The logs action explains live log mode'
assert_output '按 Ctrl+C 返回菜单' 'The logs action documents its interrupt behavior'
assert_output '已停止实时日志，返回管理菜单。' 'A logs interrupt returns to the manager'
assert_output_count_at_least 'ProxyFlow Manager v1.3.0' 2 'Logs interruption rerenders the menu'
pass 'Ctrl+C from interactive logs returns to the menu'

: > "${MOCK_DOCKER_LOG}"
run_interactive_menu $'9\n0\n0\n'
assert_status 0 'The uninstall submenu can return without changes'
assert_output '卸载 ProxyFlow' 'The uninstall submenu is displayed'
assert_output '1. 删除容器，保留 Runtime 数据和备份' 'The preserve-data uninstall choice is explicit'
assert_output '2. 完全删除 ProxyFlow、Runtime 数据和备份' 'The purge choice is explicit'
if grep -F ' down --remove-orphans' "${MOCK_DOCKER_LOG}" >/dev/null; then fail 'Returning from uninstall must not remove containers'; fi
pass 'Uninstall submenu returns without running an action'

: > "${MOCK_DOCKER_LOG}"
run_interactive_menu $'9\n1\n\n0\n'
assert_status 0 'The preserve-data uninstall menu action succeeds'
assert_output 'Data was preserved' 'The menu reuses existing preserve-data uninstall behavior'
grep -F ' down --remove-orphans' "${MOCK_DOCKER_LOG}" >/dev/null || fail 'The menu must delegate preserve-data uninstall to Compose'
pass 'Uninstall submenu maps preserve-data removal to the existing action'

MENU_INSTALL_HOME="${TEMP_ROOT}/menu install home"
MENU_INSTALL_DATA="${TEMP_ROOT}/menu install data"
MENU_TEST_HOME="${MENU_INSTALL_HOME}"
MENU_TEST_DATA="${MENU_INSTALL_DATA}"
run_interactive_menu $'1\n\n0\n'
assert_status 0 'Interactive install returns to the manager'
assert_output 'ProxyFlow 安装完成' 'Interactive install adds a concise completion summary'
assert_output "地址：http://127.0.0.1:17870" 'Interactive install reports the address'
assert_output "数据目录：${MENU_INSTALL_DATA}" 'Interactive install reports the data directory'
assert_output_count_at_least '状态：Running' 1 'Interactive install refreshes to running state'
pass 'Interactive install completes and returns to refreshed status'

MENU_TEST_HOME="${INSTALL_HOME}"
MENU_TEST_DATA="${DATA_DIR}"

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
assert_output 'Update channel: manual pin' 'Explicit image update reports the manual pin'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:1.0.0-rc.5' 'Explicit image update pulls the pinned RC5 image'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:1.0.0-rc.5' 'Update preserves an explicit RC5 image pin'
assert_file_contains "${INSTALL_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=false' 'Update keeps the explicit image unmanaged'
pass 'Update backs up the service and preserves an explicit image pin'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" uninstall extra argument
assert_status 64 'Uninstall rejects extra arguments'
assert_output 'Usage: proxyflow.sh uninstall [--purge]' 'Uninstall documents accepted arguments'
pass 'Uninstall rejects ambiguous arguments'

run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${INSTALL_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${SCRIPT}" uninstall
assert_status 0 'Default uninstall succeeds'
assert_output 'Data was preserved' 'Default uninstall reports data preservation'
[[ -f "${DATA_DIR}/state.txt" ]] || fail 'Default uninstall must preserve Runtime data'
pass 'Default uninstall removes containers and preserves data'

PURGE_HOME="${TEMP_ROOT}/purge home"
PURGE_DATA="${PURGE_HOME}/data"
mkdir -p "${PURGE_DATA}"
cp "${REPOSITORY_COMPOSE}" "${PURGE_HOME}/compose.yaml"
{
  printf '%s\n' 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:latest'
  printf '%s\n' 'PROXYFLOW_IMAGE_MANAGED=true'
  printf '%s\n' 'PROXYFLOW_UPDATE_CHANNEL=stable'
  printf '%s\n' 'PROXYFLOW_PORT=17870'
  printf '%s\n' 'PROXYFLOW_BIND_ADDRESS=127.0.0.1'
  printf 'PROXYFLOW_DATA_DIR=%s\n' "${PURGE_DATA}"
  printf '%s\n' 'PROXYFLOW_RUNTIME_TOKEN=fictional-test-token'
} > "${PURGE_HOME}/.env"
printf '%s\n' 'keep until DELETE' > "${PURGE_DATA}/state.txt"
MENU_TEST_HOME="${PURGE_HOME}"
MENU_TEST_DATA="${PURGE_DATA}"
run_interactive_menu $'9\n2\nNO\n\n0\n'
assert_status 0 'A rejected purge returns to the manager'
assert_output 'Type DELETE' 'Interactive purge keeps the existing DELETE prompt'
assert_output 'Purge cancelled' 'An incorrect purge confirmation is rejected'
[[ -f "${PURGE_DATA}/state.txt" ]] || fail 'Rejected purge must preserve Runtime data'
pass 'Interactive purge retains the existing DELETE safety gate'

run_interactive_menu $'9\n2\nDELETE\n\n0\n'
assert_status 0 'A confirmed interactive purge succeeds'
assert_output 'Runtime data, and local backups were deleted' 'Confirmed purge reports complete removal'
[[ ! -e "${PURGE_HOME}" ]] || fail 'Confirmed purge must remove the installation home'
pass 'Interactive purge delegates confirmed deletion to the existing action'

MENU_TEST_HOME="${INSTALL_HOME}"
MENU_TEST_DATA="${DATA_DIR}"

run_script env PROXYFLOW_PORT=70000 PROXYFLOW_HOME="${TEMP_ROOT}/invalid-home" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/invalid-data" "${SCRIPT}" install
assert_status 64 'Invalid port is rejected before Docker checks'
assert_output 'PROXYFLOW_PORT must be an integer from 1 to 65535' 'Invalid port has a bounded validation message'
pass 'Invalid ports fail closed'

run_script env PROXYFLOW_UPDATE_CHANNEL=nightly PROXYFLOW_HOME="${TEMP_ROOT}/invalid-channel-home" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/invalid-channel-data" "${SCRIPT}" install
assert_status 64 'Unknown update channels are rejected before Docker checks'
assert_output 'PROXYFLOW_UPDATE_CHANNEL must be rc or stable' 'Unknown update channels fail closed'
pass 'Managed update channels are allow-listed'

STANDALONE_DIR="${TEMP_ROOT}/standalone"
mkdir -p "${STANDALONE_DIR}"
cp "${SCRIPT}" "${STANDALONE_DIR}/proxyflow.sh"
chmod +x "${STANDALONE_DIR}/proxyflow.sh"
STANDALONE_HOME="${TEMP_ROOT}/standalone home"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STANDALONE_HOME}" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/standalone data" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" install
assert_status 0 'Standalone install succeeds without repository files'
cmp "${REPOSITORY_COMPOSE}" "${STANDALONE_HOME}/compose.yaml" >/dev/null || fail 'Embedded Compose must match repository Compose semantics'
assert_file_contains "${STANDALONE_HOME}/compose.yaml" '    image: ${PROXYFLOW_IMAGE:-ghcr.io/kure29/proxyflow:1.3.0}' 'Embedded Compose uses the immutable 1.3.0 image by default'
pass 'Standalone script embeds the same Compose contract'

assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:latest' 'Default install uses the Stable channel image'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Default install marks the image as script-managed'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=stable' 'Default install persists the Stable update channel'
sed -e 's#^PROXYFLOW_IMAGE=.*#PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:1.0.0-rc.2#' -e '/^PROXYFLOW_UPDATE_CHANNEL=/d' "${STANDALONE_HOME}/.env" > "${STANDALONE_HOME}/.env.rc2"
mv "${STANDALONE_HOME}/.env.rc2" "${STANDALONE_HOME}/.env"
LEGACY_PULL_MARKER="${TEMP_ROOT}/legacy-pulled"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_PULLED_MARKER="${LEGACY_PULL_MARKER}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.2 MOCK_HEALTH_VERSION_AFTER=1.0.0-rc.6 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STANDALONE_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" update
assert_status 0 'The RC6 manager updates an RC2 managed installation'
assert_output 'Current version: 1.0.0-rc.2' 'Legacy managed update reads its previous version from health'
assert_output 'Update channel: rc' 'Legacy managed update reports the RC channel'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:rc' 'Legacy managed update pulls the moving RC channel'
assert_output 'Previous version: 1.0.0-rc.2' 'Legacy managed update reports the previous release'
assert_output 'Current version: 1.0.0-rc.6' 'Legacy managed update reports the new release after health succeeds'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'Legacy managed image migrates from the RC2 pin to the RC channel'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Managed image remains managed after update'
assert_file_contains "${STANDALONE_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'Legacy managed update persists its channel'
pass 'RC2 managed installs migrate to the RC channel'

RC3_HOME="${TEMP_ROOT}/rc3 home"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.3 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${RC3_HOME}" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/rc3 data" PROXYFLOW_UPDATE_CHANNEL=rc PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" install
assert_status 0 'An RC3 managed installation is available on the RC channel'
assert_file_contains "${RC3_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'RC3 managed install already uses the moving RC channel'
assert_file_contains "${RC3_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'RC3 channel image remains manager-owned'
assert_file_contains "${RC3_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'RC3 managed install persists the RC channel'
RC3_PULL_MARKER="${TEMP_ROOT}/rc3-pulled"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_PULLED_MARKER="${RC3_PULL_MARKER}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.3 MOCK_HEALTH_VERSION_AFTER=1.0.0-rc.6 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${RC3_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" update
assert_status 0 'The RC6 manager updates an RC3 managed installation'
assert_output 'Current version: 1.0.0-rc.3' 'RC3 managed update reads its previous version from health'
assert_output 'Update channel: rc' 'RC3 managed update reports the RC channel'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:rc' 'RC3 managed update keeps pulling the moving RC channel'
assert_output 'Previous version: 1.0.0-rc.3' 'RC3 managed update reports the previous release'
assert_output 'Current version: 1.0.0-rc.6' 'RC3 managed update reports RC6 after health succeeds'
assert_file_contains "${RC3_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'RC3 managed update remains on the RC channel'
assert_file_contains "${RC3_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'RC3 managed image remains managed after update'
assert_file_contains "${RC3_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'RC3 managed update preserves its channel'
pass 'RC3 managed installs advance to RC6 through the RC channel'

RC4_HOME="${TEMP_ROOT}/rc4 home"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.4 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${RC4_HOME}" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/rc4 data" PROXYFLOW_UPDATE_CHANNEL=rc PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" install
assert_status 0 'An RC4 managed installation is available on the RC channel'
assert_file_contains "${RC4_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'RC4 managed install already uses the moving RC channel'
assert_file_contains "${RC4_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'RC4 channel image remains manager-owned'
assert_file_contains "${RC4_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'RC4 managed install persists the RC channel'
RC4_PULL_MARKER="${TEMP_ROOT}/rc4-pulled"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_PULLED_MARKER="${RC4_PULL_MARKER}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.4 MOCK_HEALTH_VERSION_AFTER=1.0.0-rc.6 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${RC4_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" update
assert_status 0 'The RC6 manager updates an RC4 managed installation'
assert_output 'Current version: 1.0.0-rc.4' 'RC4 managed update reads its previous version from health'
assert_output 'Update channel: rc' 'RC4 managed update reports the RC channel'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:rc' 'RC4 managed update keeps pulling the moving RC channel'
assert_output 'Previous version: 1.0.0-rc.4' 'RC4 managed update reports the previous release'
assert_output 'Current version: 1.0.0-rc.6' 'RC4 managed update reports RC6 after health succeeds'
assert_file_contains "${RC4_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'RC4 managed update remains on the RC channel'
assert_file_contains "${RC4_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'RC4 managed image remains managed after update'
assert_file_contains "${RC4_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'RC4 managed update preserves its channel'
pass 'RC4 managed installs advance to RC6 through the RC channel'

RC5_HOME="${TEMP_ROOT}/rc5 home"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.5 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${RC5_HOME}" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/rc5 data" PROXYFLOW_UPDATE_CHANNEL=rc PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" install
assert_status 0 'An RC5 managed installation is available on the RC channel'
assert_file_contains "${RC5_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'RC5 managed install already uses the moving RC channel'
assert_file_contains "${RC5_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'RC5 channel image remains manager-owned'
assert_file_contains "${RC5_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'RC5 managed install persists the RC channel'
RC5_PULL_MARKER="${TEMP_ROOT}/rc5-pulled"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_PULLED_MARKER="${RC5_PULL_MARKER}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.5 MOCK_HEALTH_VERSION_AFTER=1.0.0-rc.6 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${RC5_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" update
assert_status 0 'The RC6 manager updates an RC5 managed installation'
assert_output 'Current version: 1.0.0-rc.5' 'RC5 managed update reads its previous version from health'
assert_output 'Update channel: rc' 'RC5 managed update reports the RC channel'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:rc' 'RC5 managed update keeps pulling the moving RC channel'
assert_output 'Previous version: 1.0.0-rc.5' 'RC5 managed update reports the previous release'
assert_output 'Current version: 1.0.0-rc.6' 'RC5 managed update reports RC6 after health succeeds'
assert_file_contains "${RC5_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:rc' 'RC5 managed update remains on the RC channel'
assert_file_contains "${RC5_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'RC5 managed image remains managed after update'
assert_file_contains "${RC5_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=rc' 'RC5 managed update preserves its channel'
pass 'RC5 managed installs advance to RC6 through the RC channel'

STABLE_HOME="${TEMP_ROOT}/stable home"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STABLE_HOME}" PROXYFLOW_DATA_DIR="${TEMP_ROOT}/stable data" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" install
assert_status 0 'Stable channel install succeeds with mocked Docker'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:latest' 'Stable channel maps to latest'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Stable channel remains manager-owned'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=stable' 'Stable channel is persisted'
pass 'Stable managed installs default to latest without touching rc'

STABLE_PULL_MARKER="${TEMP_ROOT}/stable-pulled"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_PULLED_MARKER="${STABLE_PULL_MARKER}" MOCK_HEALTH_VERSION_BEFORE=1.0.0-rc.6 MOCK_HEALTH_VERSION_AFTER=1.0.0 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STABLE_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" update
assert_status 0 'Stable managed update succeeds with mocked Docker'
assert_output 'Current version: 1.0.0-rc.6' 'Stable update reads the previous RC version from health'
assert_output 'Update channel: stable' 'Stable update reports the Stable channel'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:latest' 'Stable update pulls the moving latest channel'
assert_output_not_contains 'Pulling: ghcr.io/kure29/proxyflow:rc' 'Stable update does not pull the RC channel'
assert_output 'Previous version: 1.0.0-rc.6' 'Stable update reports the previous RC release'
assert_output 'Current version: 1.0.0' 'Stable update reports 1.0.0 after health succeeds'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:latest' 'Stable managed update remains on latest'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Stable image remains manager-owned after update'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=stable' 'Stable update preserves its channel'
pass 'Stable managed updates advance from RC6 to 1.0.0 through latest'

STABLE_PATCH_PULL_MARKER="${TEMP_ROOT}/stable-patch-pulled"
run_script env PATH="${MOCK_BIN}:${PATH}" MOCK_DOCKER_LOG="${MOCK_DOCKER_LOG}" MOCK_PULLED_MARKER="${STABLE_PATCH_PULL_MARKER}" MOCK_HEALTH_VERSION_BEFORE=1.0.0 MOCK_HEALTH_VERSION_AFTER=1.0.1 PROXYFLOW_DOCKER_BIN="${MOCK_BIN}/docker" PROXYFLOW_HOME="${STABLE_HOME}" PROXYFLOW_SKIP_PORT_CHECK=1 "${STANDALONE_DIR}/proxyflow.sh" update
assert_status 0 'Stable patch update succeeds with mocked Docker'
assert_output 'Current version: 1.0.0' 'Stable patch update reads the previous Stable version from health'
assert_output 'Update channel: stable' 'Stable patch update preserves the Stable channel'
assert_output 'Pulling: ghcr.io/kure29/proxyflow:latest' 'Stable patch update pulls the moving latest channel'
assert_output_not_contains 'Pulling: ghcr.io/kure29/proxyflow:rc' 'Stable patch update does not pull the RC channel'
assert_output 'Previous version: 1.0.0' 'Stable patch update reports the previous Stable release'
assert_output 'Current version: 1.0.1' 'Stable patch update reports 1.0.1 after health succeeds'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_IMAGE=ghcr.io/kure29/proxyflow:latest' 'Stable patch update remains on latest'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_IMAGE_MANAGED=true' 'Stable patch image remains manager-owned'
assert_file_contains "${STABLE_HOME}/.env" 'PROXYFLOW_UPDATE_CHANNEL=stable' 'Stable patch update preserves its persisted channel'
pass 'Stable managed installs advance from 1.0.0 to 1.0.1 through latest'

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

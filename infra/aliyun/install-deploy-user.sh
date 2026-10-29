#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "run this installer as root" >&2
  exit 1
fi

if [[ $# -ne 2 || ! -f "$1" || ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: install-deploy-user.sh <ssh-ed25519-public-key-file> <running-release-sha>" >&2
  exit 64
fi

public_key_file=$1
baseline_sha=$2
read -r key_type key_data _ < "$public_key_file"
if [[ "$key_type" != ssh-ed25519 || ! "$key_data" =~ ^[A-Za-z0-9+/=]+$ ]]; then
  echo "the deployment key must be an Ed25519 public key" >&2
  exit 1
fi

state_root=/var/lib/tpqr-deploy
release_root="$state_root/releases"
baseline_dir="$release_root/$baseline_sha"
baseline_compose="$baseline_dir/docker-compose.release.yml"
current_link="$state_root/current"
previous_link="$state_root/previous"

for path in \
  /usr/local/sbin/tpqr-deploy-ssh \
  /usr/local/sbin/tpqr-deploy-root \
  /etc/sudoers.d/tpqr-deploy \
  /home/tpqr-deploy
do
  if [[ -e "$path" || -L "$path" ]]; then
    echo "deployment path already exists; inspect it before installing: $path" >&2
    exit 1
  fi
done

if [[ -L "$state_root" || ! -d "$state_root" || $(stat -c '%u' "$state_root") != 0 ]]; then
  echo "the existing deployment state directory must be a real root-owned directory" >&2
  exit 1
fi
if [[ -L "$release_root" || ! -d "$release_root" || $(stat -c '%u' "$release_root") != 0 ]]; then
  echo "the existing release directory must be a real root-owned directory" >&2
  exit 1
fi
if [[ -e "$current_link" || -L "$current_link" || -e "$previous_link" || -L "$previous_link" ]]; then
  echo "deployment state links already exist; inspect them before installing" >&2
  exit 1
fi
if [[ ! -d "$baseline_dir" || -L "$baseline_dir" || ! -f "$baseline_compose" || -L "$baseline_compose" ]]; then
  echo "the running release directory or Compose file is missing" >&2
  exit 1
fi
if [[ $(stat -c '%u' "$baseline_dir") != 0 || $(stat -c '%u' "$baseline_compose") != 0 || ! -f /opt/tpqr/.env || $(stat -c '%u' /opt/tpqr/.env) != 0 ]]; then
  echo "the running release, its Compose file, and /opt/tpqr/.env must be root-owned and present" >&2
  exit 1
fi

run_baseline_compose() {
  TPQR_RELEASE="$baseline_sha" TPQR_RUNTIME_ENV_FILE=/opt/tpqr/.env docker compose \
    --project-name aliyun \
    --env-file /opt/tpqr/.env \
    -f "$baseline_compose" \
    "$@"
}

run_baseline_compose config --quiet
api_container=$(run_baseline_compose ps -q api)
gateway_container=$(run_baseline_compose ps -q tpqr-gateway)
[[ -n "$api_container" && -n "$gateway_container" ]]
[[ $(docker inspect -f '{{.Config.Image}}' "$api_container") == "tpqr-cn-api:$baseline_sha" ]]
[[ $(docker inspect -f '{{.Config.Image}}' "$gateway_container") == "tpqr-cn-gateway:$baseline_sha" ]]
[[ $(docker inspect -f '{{.State.Health.Status}}' "$api_container") == healthy ]]
[[ $(docker inspect -f '{{.State.Status}}' "$gateway_container") == running ]]
[[ $(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$api_container") == "$baseline_compose" ]]
[[ $(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$gateway_container") == "$baseline_compose" ]]
[[ $(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/tpqr"}}{{.Source}}{{end}}{{end}}' "$api_container") == /opt/tpqr/data ]]
[[ $(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$gateway_container") == aliyun_caddy-data ]]
[[ $(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Name}}{{end}}{{end}}' "$gateway_container") == aliyun_caddy-config ]]
docker volume inspect aliyun_caddy-data aliyun_caddy-config >/dev/null
run_baseline_compose exec -T api node -e 'fetch("http://127.0.0.1:8787/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1
app_origin=$(awk -F= '$1 == "APP_ORIGIN" { sub(/^[^=]*=/, ""); print; exit }' /opt/tpqr/.env)
[[ "$app_origin" == https://* ]]
curl --fail --silent --show-error --output /dev/null --max-time 15 "$app_origin/api/health"

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
sudoers_file=$(mktemp)
trap 'rm -f "$sudoers_file"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/tpqr-deploy-root *\n' tpqr-deploy > "$sudoers_file"
visudo -cf "$sudoers_file" >/dev/null

install -o root -g root -m 0755 "$script_dir/tpqr-deploy-ssh" /usr/local/sbin/tpqr-deploy-ssh
install -o root -g root -m 0755 "$script_dir/tpqr-deploy-root" /usr/local/sbin/tpqr-deploy-root
useradd --system --create-home --home-dir /home/tpqr-deploy --shell /bin/sh tpqr-deploy
passwd --lock tpqr-deploy >/dev/null
install -d -o tpqr-deploy -g tpqr-deploy -m 0700 /home/tpqr-deploy/.ssh
printf 'restrict,command="/usr/local/sbin/tpqr-deploy-ssh" %s %s\n' "$key_type" "$key_data" \
  > /home/tpqr-deploy/.ssh/authorized_keys
chown tpqr-deploy:tpqr-deploy /home/tpqr-deploy/.ssh/authorized_keys
chmod 0600 /home/tpqr-deploy/.ssh/authorized_keys
install -o root -g root -m 0440 "$sudoers_file" /etc/sudoers.d/tpqr-deploy
visudo -cf /etc/sudoers.d/tpqr-deploy >/dev/null
ln -s "$baseline_dir" "$current_link.new"
mv -Tf "$current_link.new" "$current_link"

echo "restricted TP QR deployment account installed; existing release retained as rollback baseline"

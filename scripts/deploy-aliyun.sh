#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: deploy-aliyun.sh <release-bundle> <commit-sha> <public-smoke-slug>" >&2
  exit 64
fi

bundle=$1
release_sha=$2
smoke_slug=$3
deploy_host=${ALIYUN_DEPLOY_HOST:-}
deploy_user=${ALIYUN_DEPLOY_USER:-}
deploy_port=${ALIYUN_DEPLOY_PORT:-22}

[[ -f "$bundle" ]]
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$smoke_slug" =~ ^[A-Za-z0-9_-]{1,80}$ ]]
[[ "$deploy_host" =~ ^[A-Za-z0-9.:-]+$ ]]
[[ "$deploy_user" =~ ^[a-z_][a-z0-9_-]*\$?$ ]]
[[ "$deploy_port" =~ ^[0-9]{1,5}$ ]]
(( deploy_port >= 1 && deploy_port <= 65535 ))
: "${ALIYUN_DEPLOY_KEY:?ALIYUN_DEPLOY_KEY is required}"
: "${ALIYUN_DEPLOY_KNOWN_HOSTS:?ALIYUN_DEPLOY_KNOWN_HOSTS is required}"

temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT
key_file="$temp_dir/deploy_key"
known_hosts_file="$temp_dir/known_hosts"
printf '%s\n' "$ALIYUN_DEPLOY_KEY" > "$key_file"
printf '%s\n' "$ALIYUN_DEPLOY_KNOWN_HOSTS" > "$known_hosts_file"
chmod 600 "$key_file" "$known_hosts_file"

known_host=$deploy_host
if (( deploy_port != 22 )); then
  known_host="[$deploy_host]:$deploy_port"
fi
ssh-keygen -F "$known_host" -f "$known_hosts_file" >/dev/null

ssh \
  -i "$key_file" \
  -p "$deploy_port" \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$known_hosts_file" \
  -o LogLevel=ERROR \
  "$deploy_user@$deploy_host" \
  "deploy $release_sha $smoke_slug" < "$bundle"

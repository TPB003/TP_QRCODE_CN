#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "run this installer as root" >&2
  exit 1
fi

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "usage: install-deploy-user.sh <ssh-ed25519-public-key-file>" >&2
  exit 64
fi

public_key_file=$1
read -r key_type key_data _ < "$public_key_file"
if [[ "$key_type" != ssh-ed25519 || ! "$key_data" =~ ^[A-Za-z0-9+/=]+$ ]]; then
  echo "the deployment key must be an Ed25519 public key" >&2
  exit 1
fi

for path in \
  /usr/local/sbin/tpqr-deploy-ssh \
  /usr/local/sbin/tpqr-deploy-root \
  /etc/sudoers.d/tpqr-deploy \
  /home/tpqr-deploy \
  /var/lib/tpqr-deploy
do
  if [[ -e "$path" ]]; then
    echo "deployment path already exists; inspect it before installing: $path" >&2
    exit 1
  fi
done

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
install -d -o root -g root -m 0750 /var/lib/tpqr-deploy/releases
visudo -cf /etc/sudoers.d/tpqr-deploy >/dev/null

echo "restricted TP QR deployment account installed"

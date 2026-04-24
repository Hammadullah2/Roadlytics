#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo or as root."
  exit 1
fi

TARGET_USER="${SUDO_USER:-${USER:-azureuser}}"

apt-get update
apt-get install -y ca-certificates curl gnupg git unzip

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker
usermod -aG docker "${TARGET_USER}" || true

mkdir -p /opt/roadlytics
chown -R "${TARGET_USER}:${TARGET_USER}" /opt/roadlytics

echo "Docker and Docker Compose are installed."
echo "Re-login before using docker without sudo."


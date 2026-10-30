#!/usr/bin/env bash
# Servidor nuevo (Ubuntu/Debian): instala Docker y Portainer CE. Ejecutar como root: sudo bash instalar-docker-portainer.sh
# Es repetible: si Docker o Portainer ya existen, no los toca.
set -euo pipefail

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

docker volume create portainer_data >/dev/null
docker inspect portainer >/dev/null 2>&1 || docker run -d --name portainer --restart=always \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:lts

docker --version
echo "Portainer: https://$(hostname -I | awk '{print $1}'):9443  (crea el admin en los primeros 5 min o se bloquea; reinicia con 'docker restart portainer')"

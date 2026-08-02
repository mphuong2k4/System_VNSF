#!/usr/bin/env sh
set -eu
printf 'WARNING: this removes only VNSF local Docker volumes. Type RESET-VNSF to continue: '
read -r answer
test "$answer" = RESET-VNSF || { echo 'Cancelled'; exit 1; }
docker compose down --volumes

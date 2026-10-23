#!/usr/bin/env bash
set -euo pipefail
sudo -v
preparo_redesign=$(mktemp -d /tmp/ramo-motorista-web.XXXXXX)
trap 'rm -rf -- "$preparo_redesign"' EXIT
origem_redesign='https://github.com/iansilva23/ramo-nessa/releases/download/driver-ride-web-a13377253135-r2'
curl --fail --silent --show-error --location --retry 2 --max-time 120 \
  "$origem_redesign/RamoNessa-Motorista-Web-a13377253135.zip" \
  --output "$preparo_redesign/motorista.zip"
curl --fail --silent --show-error --location --retry 2 --max-time 120 \
  "$origem_redesign/Instalador-Motorista-Web-a13377253135-r2.tar.gz" \
  --output "$preparo_redesign/instalador.tar.gz"
printf '%s  %s\n' \
  0cd8a874bdba37ea41caccca0bc8bb13468ceaf4973e11053277269816a0d8b8 "$preparo_redesign/motorista.zip" \
  34979d1d15571fb85d418b2cea02be70013a5466e698d5fcd5f96527fecb5e85 "$preparo_redesign/instalador.tar.gz" \
  | sha256sum --check -
tar -xzf "$preparo_redesign/instalador.tar.gz" -C "$preparo_redesign"
sudo node "$preparo_redesign/deploy/staging/driver-ride-web-update.mjs" \
  "$preparo_redesign/motorista.zip" \
  0cd8a874bdba37ea41caccca0bc8bb13468ceaf4973e11053277269816a0d8b8

#!/usr/bin/env bash
set -Eeuo pipefail

revision=${1:-}
if [[ $EUID != 0 || ! $revision =~ ^[a-f0-9]{40}$ || -z ${SUDO_USER:-} ]]; then
  echo 'Execute com sudo e informe o SHA completo da atualização.' >&2
  exit 1
fi

repo=/opt/ramo-nessa
container=ramo-nessa-site-institutional-site-1
active_tag=ramo-nessa-site:refinado
candidate="ramo-nessa-site:marca-${revision:0:12}"
rollback_tag="ramo-nessa-site:rollback-marca-${revision:0:12}"
compose=(docker compose --project-name ramo-nessa-site -f /opt/ramo-nessa-site/compose.yml)
up=(up -d --no-deps --no-build --pull never --force-recreate --wait --wait-timeout 120 institutional-site)
domain=https://ramonessa.com.br

exec 9>/run/lock/ramo-nessa-site-brand.lock
flock -n 9
"${compose[@]}" config --quiet
site_id=$(docker inspect -f '{{.Id}}' "$container")
compose_id=$("${compose[@]}" ps -q institutional-site)
[[ -n $compose_id && $site_id == "$compose_id"* ]]
[[ $(docker inspect -f '{{.Config.Image}} {{.State.Health.Status}}' "$container") == "$active_tag healthy" ]]
previous=$(docker inspect -f '{{.Image}}' "$container")

install -d -m 755 /opt/ramo-nessa-site/releases
release=$(mktemp -d "/opt/ramo-nessa-site/releases/marca-${revision:0:12}.XXXXXX")
sudo -u "$SUDO_USER" git -C "$repo" archive "$revision" apps/institutional-site | tar -x -C "$release"
docker build -t "$candidate" "$release/apps/institutional-site"

[[ $(docker inspect -f '{{.Id}} {{.Image}} {{.State.Health.Status}}' "$container") == "$site_id $previous healthy" ]]
docker exec "$container" node ops/backup.mjs
docker image tag "$previous" "$rollback_tag"

rollback() {
  trap - ERR
  echo 'Falha na ativação. Restaurando o site anterior.' >&2
  if docker image tag "$rollback_tag" "$active_tag" && "${compose[@]}" "${up[@]}"; then
    echo 'Site anterior restaurado.' >&2
  else
    echo "A restauração automática falhou. Imagem anterior: $rollback_tag" >&2
  fi
  exit 1
}

trap rollback ERR
docker image tag "$candidate" "$active_tag"
"${compose[@]}" "${up[@]}"
html=$(curl -fsS --retry 3 --max-time 15 "$domain/")
[[ $html == *'/ramo-nessa-logo.webp'* && $html == *'/ramo-nessa-favicon.png'* ]]
content=$(curl -fsS --retry 3 --max-time 15 "$domain/api/site-content")
printf '%s' "$content" | python3 -c 'import json, sys; f=json.load(sys.stdin)["footer"]; assert isinstance(f["enabled"], bool) and f["email"] and f["cnpj"]'
if [[ $content == *'"enabled":true'* ]]; then
  [[ $html == *'id="contato"'* && $html == *'mailto:'* ]]
fi
curl -fsS --retry 3 --max-time 15 "$domain/ramo-nessa-logo.webp" -o /dev/null
trap - ERR
echo "SITE_PUBLICADO $revision"

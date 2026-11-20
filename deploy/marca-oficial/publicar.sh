#!/usr/bin/env bash
set -euo pipefail

sudo -v
pasta=$(mktemp -d /tmp/ramo-marca-oficial.XXXXXX)
raw='https://raw.githubusercontent.com/iansilva23/ramo-nessa'
release='https://github.com/iansilva23/ramo-nessa/releases/download/marca-oficial-d47c6c91a3fc'
fonte='d47c6c91a3fc158c47ed21d881c2bec1ed401c25'

baixar() {
  curl --proto '=https' -fLsS --retry 2 --max-time 180 "$1" -o "$pasta/$2"
}

baixar "$raw/912f686186dbdcfdd49fdeb7a7b3648e1078d468/deploy/marca-oficial/rollout.py" rollout.py
baixar "$raw/437d951ff1327fbd45cf305f41e90c686846181c/deploy/second-update/prepare.py" prepare-guard.py
baixar "$raw/$fonte/apps/admin/index.html" adm-index.html
baixar "$raw/$fonte/apps/admin/favicon.svg" adm-favicon.svg
for app in Passageiro Motorista; do
  arquivo="RamoNessa-$app-PWA-Marca-Oficial-Homologacao.zip"
  baixar "$release/$arquivo" "$arquivo"
done

printf '%s  %s\n' \
  996b37d25eb964f38525e3deab9423543bf71824ab2ed6c3ef1d19cfee739548 "$pasta/rollout.py" \
  aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393 "$pasta/prepare-guard.py" | sha256sum -c -

sudo python3 -I "$pasta/rollout.py" apply "$pasta/prepare-guard.py" "$pasta"
printf 'Se precisar reverter: sudo python3 -I %q rollback %q -\n' "$pasta/rollout.py" "$pasta/prepare-guard.py"

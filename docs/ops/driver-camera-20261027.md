# Instalar a atualização de câmera do Motorista Web

Fonte do aplicativo: `28ff82ae8b922108f9208889b2f5bf3cdc215a6a`. Pacote validado em Chromium/WebKit e em três cenários de instalação/recuperação com Caddy.

Entre na VPS com `ssh ubuntu@15.235.24.180` e execute o bloco inteiro. A atualização substitui somente o Motorista Web; os APKs são instalados separadamente no aparelho. O instalador confere os provedores ativos e preserva Passageiro, ADM, Core e banco.

```bash
bash <<'ATUALIZAR_CAMERA_MOTORISTA'
set -euo pipefail
sudo -v
preparo_mapa=$(mktemp -d /tmp/ramo-camera.XXXXXX)
release_mapa='https://github.com/iansilva23/ramo-nessa/releases/download/driver-camera-web-20261027-r1'

curl -fLsS --retry 2 --max-time 180 "$release_mapa/Instalador-Motorista-Camera-Web.tar.gz" -o "$preparo_mapa/instalador.tar.gz"
printf '%s  %s\n' 05254fa001fc3134266d7dfdb64e85072f863c33b8426e86475ded947443fa79 "$preparo_mapa/instalador.tar.gz" | sha256sum -c -
tar -xzf "$preparo_mapa/instalador.tar.gz" -C "$preparo_mapa"

curl -fLsS --retry 2 --max-time 180 "$release_mapa/RamoNessa-Motorista-Camera-Web.zip" -o "$preparo_mapa/atualizacao.zip"
sudo node "$preparo_mapa/deploy/staging/driver-camera-web-update.mjs" "$preparo_mapa/atualizacao.zip" ca218e61860dd955c090e791fea8f6804841f0af8873bfd8a1e232a951bad98b
ATUALIZAR_CAMERA_MOTORISTA
```

Aguarde `MOTORISTA WEB ATUALIZADO`. Se aparecer erro, preserve a saída e envie para análise antes de repetir. O instalador guarda o plano e o resultado em `/opt/ramo-nessa-driver-camera/28ff82ae8b92` e ensaia o retorno automático em caso de falha durante a troca.

Depois, reabra o Motorista Web e confira inclinação inicial, zoom, rotação manual com retomada após três segundos e controles acima do cartão. No Android/iPhone, confira também a localização com o app em segundo plano e a tela bloqueada. A instalação na VPS e o aceite em aparelho real ainda dependem da execução pelo operador.

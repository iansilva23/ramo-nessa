# Corrigir aparência do menu do Guia Local no Passageiro Web

Aplicação revisada: `7984d449122e3402de2d09c80c463da6b98e3f20`. O menu e o fundo inferior acompanham Claro, Escuro e Seguir sistema. A aparência escura existente e o amarelo do item selecionado são preservados.

Entre na VPS com `ssh ubuntu@15.235.24.180`. Execute o bloco completo. O instalador atualiza somente o Passageiro Web e copia o Motorista ativo com verificação de integridade. Core, ADM, banco e provedores são preservados. Os pacotes Android/iOS são instalados separadamente.

```bash
bash <<'CORRIGIR_MENU_GUIA'
set -euo pipefail
sudo -v

preparo_guia=$(mktemp -d /tmp/ramo-guia-menu.XXXXXX)
release_guia='https://github.com/iansilva23/ramo-nessa/releases/download/guide-menu-web-20261027-r1'

curl -fLsS --retry 2 --max-time 180 "$release_guia/Instalador-Guia-Menu-Web.tar.gz" -o "$preparo_guia/instalador.tar.gz"
printf '%s  %s\n' ff17f65bb5a4d5dd8fcc4f2f1c60a5467d7415424b4846830cdf06aeddbfab08 "$preparo_guia/instalador.tar.gz" | sha256sum -c -
tar -xzf "$preparo_guia/instalador.tar.gz" -C "$preparo_guia"

curl -fLsS --retry 2 --max-time 180 "$release_guia/RamoNessa-Guia-Menu-Web.zip" -o "$preparo_guia/atualizacao.zip"
sudo node "$preparo_guia/deploy/staging/guide-menu-web-update.mjs" "$preparo_guia/atualizacao.zip" 0489a394d544f0021c2e7fe5f9fa98c14cdebf5e4d902ca986931879dbc77d53
CORRIGIR_MENU_GUIA
```

Resultado esperado: `GUIA_MENU_WEB_ATUALIZADO`. Se aparecer erro, preserve a saída e envie para análise antes de repetir. Os planos de instalação e recuperação ficam em `/opt/ramo-nessa-guide-menu-web/7984d449122e`. Instalação, falha após troca e recuperação de Gateway ausente foram ensaiadas com Caddy em ambiente isolado.

Após instalar, feche completamente o Passageiro Web e abra novamente. Confira o Guia com aparência clara e escura; com Seguir sistema, confira o acompanhamento do tema do aparelho. O menu deve manter o destaque amarelo, com texto legível e o fundo inferior correspondente à aparência.

# Atualização Web de destino, notificações e nomes dos locais

Autorização de continuação e atualização recebida do responsável em 26/10/2026. Aplicação preservada em `5f51e1f7b9fd714ded24801afb034de0c292f2fd` (PR #77); preparação operacional independente, sem merge.

## Base observada na VPS

Diagnóstico somente leitura executado pelo responsável em 26/10/2026 às 14:26 UTC:
- Core: imagem `sha256:f54558fc37bc7f7701d6ebd51441981b7d8829a879003d451b52c526868678bf`, 255 arquivos JavaScript, assinatura `4ebf6343814b1af12a207074ad1a9530ac4052abff432ea861438ea2f3a70fe7`.
- Lock de dependências: `3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e`.
- Gateway: imagem `sha256:80326cbe858af62b552e2436f9195d3449f989868ccc9757ee974c3a02bf72d9`; arquivos amostrados do ADM correspondem à base `2e0c61cc273ee276c03a4670bf2fa57573f900be`.
- Web: `/opt/ramo-nessa-web/releases/consistency-3c5fa5e5ab63/bundles`, somente leitura.
- Catálogo publicado 89: 41 regiões, 14 tarifas; assinatura do snapshot `5c628e7e588561e0787bca010b70891c8852877ddba84aa9839c9dd4ef0f2300`.
- Migrações até 097; PostgreSQL explicitamente selecionado: `ramo-nessa-staging-postgres-1`.

## Procedimento

O instalador confirma a assinatura integral do Core e do ADM e o histórico completo das migrações. Reutiliza as imagens e as configurações efetivamente ativas, cria backup com restauração isolada e aplica apenas os 12 arquivos JavaScript do Core que mudaram, mapas de fonte correspondentes, `src/app.js` do ADM, migração 098 e os dois bundles Web configurados. Assinatura esperada do Core atualizado: `c877a82fc032f71e0cb5c6ec48684b617d857095d9381fdb3aab7802945e02bf`.

Configurações de OTP, FCM, mapas, pagamentos, Asaas, tarifas e Caddy são preservadas a partir do runtime. O catálogo é comparado antes/depois. Migração 098 adiciona duas colunas opcionais, sem atualizar registros existentes. Embarque, ocorrências e bônus devem continuar desativados. Android/iOS não são instalados por este pacote.

O retorno não restaura o banco. Se houver adoção de dados/recursos, inclusive nomes novos de locais, mantém o Core compatível e restaura apenas a Web anterior. Falhas são registradas em arquivos privados para revisão; o instalador não repete silenciosamente uma ativação iniciada.

## Validação e estado

Compilações locais da base e do candidato confirmaram as duas assinaturas e a lista exata dos 12 arquivos alterados. Testes locais do worker, dos argumentos/deltas de runtime e da extração passaram. O workflow `passenger-polish-live-package.yml` concluiu compilação configurada, navegação dos dois aplicativos em Chromium/WebKit e ensaio Docker/PostgreSQL com backup restaurado, falhas após Core/Web, remoção do gateway e retorno sem restaurar dados financeiros. A consulta autenticada recuperou o nome “Café Jeri” após a migração. As políticas permaneceram desligadas, e novas informações mantiveram o Core compatível no retorno.

Execução aprovada: https://github.com/iansilva23/ramo-nessa/actions/runs/40340000556. Preparação testada: `4a5e87bf498221c1ba5947c98ab12e5b4f809192`; pacote publicado em https://github.com/iansilva23/ramo-nessa/releases/tag/passenger-polish-web-20261026-r1.

| Arquivo | SHA-256 |
|---|---|
| RamoNessa-Destino-Notificacoes-Web.zip | e9ed0d70f218001d600d6b897fa3e6df2c29e8ff8712d10802ec939543949084 |
| Instalador-Destino-Notificacoes-Web.tar.gz | e2df161bf656cbba0d1fb8c91f47a2c3476371557953812bee085e1229aa9de6 |

O ZIP publicado foi baixado novamente: hash confirmado e todos os 130 arquivos extraídos e conferidos contra o manifesto restrito. A revisão posterior altera somente este relatório; o instalador da release continua na revisão testada.

VPS ainda sem atualização deste lote. Aceitação visual e comprovação de entrega/toque de push em aparelhos reais permanecem pendentes. Satélite e distorção dos ícones seguem adiados.

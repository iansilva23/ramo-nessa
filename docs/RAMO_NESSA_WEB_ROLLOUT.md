# Ramo Nessa Web — roteiro de homologação controlada

**Preparação somente. PR #6 DRAFT; não autoriza deploy, merge ou migration.**
O estado da VPS ainda precisa ser lido no momento da atualização. Este roteiro
não certifica configurações, backup, domínio ou provedores que não foram inspecionados.

## 1. Autorizações e limites

A autorização futura deve especificar Core, gateway/Caddy, dois bundles e
migrações pendentes aprovadas. `085_web_push_preferences.sql` é necessária
para registrar push Web; a sessão HttpOnly por si só não exige migration.
Não incluir produção, main, preços, repasses, modo/chaves Mercado Pago, rotação
de credenciais, regeneração de `.env` ou restauração do banco nessa autorização.
Cobranças, envio real de OTP/push e testes com pessoas dependem de autorização
separada para as contas/dispositivos envolvidos.

## 2. Inventário antes de escolher o commit de atualização

No diretório real da homologação, conferir branch/commit e mudanças locais.
Registrar nomes, IDs de imagens e saúde SOMENTE dos containers do projeto
`ramo-nessa-staging`. Não imprimir `.env`, credenciais, `docker inspect` bruto
ou `docker compose config` com provedores reais. Não remover mudanças locais.

Comparar o commit em execução com o commit candidato, incluindo Core, ADM,
Compose, overlays, arquivos de migração e mounts. A branch Web parte de uma
base de desenvolvimento; não presumir que ela coincide com a revisão da VPS.
Se o candidato remover correções existentes ou introduzir alterações não
aprovadas no servidor, interromper e revisar a composição do release.

Confirmar os overlays e configurações reais de OTP, Firebase e Maps; preservar
as configurações atuais de pagamentos e repasses. O Compose base e o README
inicial não são inventário do ambiente hoje configurado. Não iniciar pelo
Compose base sozinho, nem executar `generate-env.mjs` para atualizar uma VPS existente.

Consultar `schema_migrations` somente em leitura: filename, checksum e applied_at.
Comparar com os SQL do candidato; verificar checksums de migrações já aplicadas.
`start.mjs` chama Compose com migrate, e o runner aplica TODOS os SQL pendentes,
além de preencher checksums legados ausentes. Não existe filtro para aplicar
somente 085. Qualquer outra pendência ou checksum divergente exige revisão
e autorização antes de iniciar; não editar o histórico nem marcar SQL como aplicado.

## 3. Backup e material de retorno

Depois de confirmar o escopo e a janela, usar os helpers existentes:

```bash
node deploy/staging/backup.mjs --output-dir=/var/backups/ramo-nessa-staging
node deploy/staging/verify-backup.mjs --backup-dir=<snapshot-exato-criado>
```

Os comandos são referência para o operador autorizado; não foram executados
na VPS nesta preparação. Conferir dump, documentos e hashes. Backup verificado
não equivale a restauração ensaiada: o `restore-drill.mjs` existente deve ser
avaliado e executado apenas contra seu ambiente descartável, nunca o banco ativo.

O backup não inclui `.env` nem arquivos privados de runtime. Preservar esses
arquivos e overlays de maneira privada, com permissões e caminhos originais,
fora de `web-dist`, do GitHub e do chat. Não anexar dumps/documentos de usuários.

Preservar commit, Caddy/Compose, bundles anteriores e imagens anteriores por
IDs/referências recuperáveis ANTES de `--build`: tags `:staging` são mutáveis.
Não confiar em recompilar um commit antigo como substituto da imagem que
estava rodando. Não remover imagens, volumes ou snapshots para liberar espaço.

## 4. Configuração pública e construção dos bundles

Construir os dois apps a partir do MESMO commit que será usado pelo Core,
em workspace separado e com lockfiles conferidos. Configurar chave própria
Maps JavaScript, restrita ao hostname e à API; nunca usar chave do servidor
ou Android/iOS. Não usar `--ci-review` ou placeholder para homologação real.

Para cada app, preparar cinco valores públicos Firebase Web: API_KEY,
APP_ID, PROJECT_ID, MESSAGING_SENDER_ID e VAPID_KEY, conforme
`prepare_web_push.mjs`. Os dois registros Web precisam de appIds distintos,
no projeto usado pelo FCM do Core. Não substituir por appId Android/iOS,
service account ou VAPID privado. Preparar cada papel com seus próprios valores.
Não copiar ou alterar o JSON privado do Core para habilitar o navegador.

Após `prepare_web_maps.mjs` e `prepare_web_push.mjs`, os builds usam:

```bash
# Dentro de apps/passenger:
flutter build web --release --no-web-resources-cdn --base-href=/passageiro/ \
  --dart-define=RAMO_CORE_BASE_URL= --dart-define=RAMO_PREVIEW_MODE=false
# Dentro de apps/driver:
flutter build web --release --no-web-resources-cdn --base-href=/motorista/ \
  --dart-define=RAMO_CORE_BASE_URL= --dart-define=RAMO_PREVIEW_MODE=false
```

O workflow de revisão não recebe configuração real de push e seus artefatos
não são instaladores/pacotes de homologação. Regenerar os bundles configurados;
não editar à mão arquivos compilados, Maps ou Firebase depois da validação.

Para preparar homologação completa com push, executar a checagem somente leitura:

```bash
node scripts/web/verify_web_homologation.mjs \
  --passenger=<diretorio-do-bundle-passageiro> \
  --driver=<diretorio-do-bundle-motorista> \
  --firebase-project=<projeto-publico-confirmado-do-core>
```

Ela reutiliza a checagem de estrutura/Maps SEM exceção de revisão, exige os
cinco campos públicos, appIds Web distintos e projeto/remetente coerentes.
Recusa symlinks/arquivos especiais, arquivos privados comuns e marcadores PEM;
interpreta configuração como JSON, nunca executa JS do artefato. Não publica,
não grava arquivos, não chama Docker/provedores, não lê o `.env` e não imprime
valores recebidos nas mensagens de configuração.

A checagem valida estrutura/formato, não a validade das chaves no provedor,
restrições Google Cloud, entrega de FCM, proveniência do código ou ausência
de todo segredo possível. Conferir proveniência do workflow/commit, hashes
e o conteúdo entregue. Ela não é necessária para os bundles de revisão com
push opcional/desligado, que continuam sendo apenas revisão.

## 5. Atualização — parada obrigatória antes de executar

Só prosseguir após inventário, backup/material de retorno, configurações,
bundles verificados, lista exata de migrações e autorização explícita da VPS.
Não há comando de atualização automática neste roteiro. Preparar um plano
específico para o estado real encontrado, incluindo janela de indisponibilidade.

Core, gateway e PWAs precisam de atualização coordenada. Não liberar URLs
novas com Core antigo, nem manter dois bundles de versões diferentes durante
os testes. O cliente novo exige `x-ramo-web-session: 1` e não usa autenticação
privada legada como fallback. Manter Host/origem HTTPS no proxy e mounts apenas
dos bundles, sem segredos/documentos. Não desabilitar CSRF, CSP ou TLS para passar.

## 6. Aceite no ambiente real

Conferir `/health`, `/ready`, ADM e as duas rotas; depois verificar headers
recebidos pelo Safari/Chrome, GPS somente nas PWAs, CSP, TLS e cookies por papel.
Nenhum desses estados foi verificado na VPS por este roteiro.

Em contas/aparelhos próprios autorizados, validar login/OTP, reabertura,
armazenamento local limpo, expiração, troca de abas/conta e logout. Verificar
que a credencial privada não aparece no JS/storage/URL/logs, e que uma aba
antiga não encerra a conta atual. Repetir uma regressão de login Android/iOS.

No iPhone real: instalação pela Tela de Início, primeira permissão, GPS negado
ou revogado, rede indisponível e atualização/reabertura da PWA. No motorista:
tela oculta/bloqueada, disponibilidade, localização vencida e reconexão; não
prometer rastreamento contínuo como no nativo ou estender oferta de 35 segundos.

Testar FCM somente nos dispositivos autorizados, incluindo preferência de
avisos, revogação de permissão, encerramento da sessão e app em segundo plano.
Não disparar campanha, oferta a terceiros ou teste financeiro como prova de push.

Maps/GPS/rotas, Mercado Pago/3DS/Pix/cartão salvo e corridas ponta a ponta
continuam com cenários próprios. Nenhuma cobrança ou mudança do modo financeiro
atual é autorizada por um build aprovado. Planejar testes de pagamento com
contas/ambiente de teste apropriados e autorização específica, sem converter
silenciosamente a configuração financeira já em uso.

## 7. Retorno à versão anterior

Se checks de saúde, ADM, autenticação nativa ou sessão Web falharem, interromper
o aceite e não liberar usuários/motoristas Web. Restaurar o conjunto previamente
registrado de imagens, configurações e arquivos estáticos, conforme plano autorizado.
Não sobrescrever tags antigas ou reconstruir sem a imagem recuperável registrada.

Antes de voltar o binário antigo, testar sua compatibilidade com as migrações
aplicadas em banco descartável. A 085 acrescenta suporte Web/preferência, mas
compatibilidade do binário antigo e de OUTRAS migrações não é presumida.
Não executar down migration, apagar linhas Web, excluir colunas, restaurar dump
no banco ativo ou apagar volumes como rollback automático. Restaurar banco
é uma ação distinta que pode perder dados posteriores ao snapshot e requer
decisão, janela e autorização específicas. Não invalidar sessões nativas
ou alterar saldo/repasses para corrigir o navegador.

Registrar commit/imagens de retorno e resultados. Se as URLs Web antes não
existiam, voltar ao estado não publicado; testar novamente ADM/apps nativos.
Reabrir as PWAs de teste e conferir caches/workers, sem assumir que arquivos
do servidor atualizam instantaneamente uma página já aberta.

## Integração com domínio, ADM e site — 15/10/2026

O operador confirmou a publicação do site institucional e da seção Site e aplicativos,
revisão b3892104594e5f2d345f1e5c903a8908108c1232. Isso não publicou as PWAs.
O candidato integrado preserva o endereço `/administrodo/`, a seção
`/administrodo/site-aplicativos`, os proxies `/site-management/*` e `/media/*`,
o host `app.ramonessa.com.br`, o site `ramonessa.com.br` e o redirecionamento www.
Não restaurar `/admin/` nem substituir o Caddyfile vivo por um template antigo.
A origem explícita de WebSocket usa o host da resposta (`wss://{host}`), para
não depender do APP_DOMAIN legado ainda apontando ao hostname OVH. As regras
estritas do ADM e o GPS liberado apenas nos dois escopos PWA são preservados.

Antes de qualquer atualização Web, repetir inventário e capturar o Caddyfile completo,
o Compose com os overlays, a origem da imagem do site e o volume SQLite existente.
O git HEAD da VPS pode permanecer 7f608676 com alterações locais aplicadas;
HEAD sozinho não representa o ADM/site em execução. Não descartar o worktree.
O Core ainda precisa de atualização coordenada e a migration 085 continua pendente
até confirmação e autorização próprias. Não executar novamente os ativadores
históricos do ADM/site como atalho para implantar Web.

Os botões do site devem continuar em breve até os dois bundles reais serem
configurados, aprovados e homologados. Depois, publicar seus links pelo novo ADM:
`https://app.ramonessa.com.br/passageiro/` e
`https://app.ramonessa.com.br/motorista/`. Não alterar os links antes disso.

Permanecem necessários a chave Maps JavaScript restrita ao navegador e os dois
appIds Firebase Web distintos do projeto ramo-nessa, com VAPID público. A revisão
não cria chaves, não revela a service account e não usa credenciais do servidor
no navegador. O CI integrado continua produzindo revisão, sem deploy ou migrations.

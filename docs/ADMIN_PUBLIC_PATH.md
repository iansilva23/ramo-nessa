# Endereço público do ADM

O painel usa `/administrodo/`. A alteração cobre menus, roteador, páginas carregadas sob demanda, healthchecks e os gateways standalone, staging e produção. Diretório interno `/srv/admin` e API `/v1/admin/*` permanecem iguais. Login, escopos e funções do painel não mudam.

`/admin`, `/admin/` e `/administrador/` caem no 404 do gateway; a raiz `/` não redireciona para o ADM. O nome do caminho não constitui autenticação nem garante sigilo: arquivos públicos do painel contêm seus próprios links. O servidor continua responsável pela autorização de dados e operações.

## Homologação

Executar `npm run check` e `npm test` em `apps/admin`. A regressão executa o roteador e o carregador de páginas, verificando links profundos, navegação push/replace e fallback de permissões. A configuração Caddy também deve passar em `caddy validate` no ambiente Docker antes de ativar. Verificar em HTTPS o shell, CSS, módulo JS, página interna e os 404 antigos; verificar `/ready` e login manual com conta autorizada. Testes locais não equivalem a homologação na VPS.

## Aplicação isolada na VPS

Esta branch parte de `7f6086763d78f64c65d4939151d728e46f51b6fb`, versão identificada na VPS em 15/10/2026. Não inclui o rollout dos apps Flutter Web, migrações de banco ou alterações de provedores.

Antes de aplicar, identificar imagem, arquivos Compose, diretório de trabalho e arquivo de ambiente usados pelo gateway em execução. Preservar a imagem anterior com uma tag de rollback e fazer backup do Caddyfile ativo. O Caddyfile da VPS possui uma alteração local autorizada que adiciona `app.ramonessa.com.br` ao lado de `{$APP_DOMAIN}`: preservar essa linha; não substituir o arquivo inteiro pelo do GitHub. Aplicar apenas a troca das rotas administrativas e remoção do redirecionamento raiz.

Construir e validar a nova imagem do gateway antes de substituir a atual. Recriar somente o gateway com os mesmos arquivos Compose e ambiente. Não executar `start.mjs`, migrações, atualização de Core/Postgres ou comandos que removam volumes. Se houver falha, restaurar o Caddyfile de backup e a imagem anterior, e recriar somente o gateway. O acesso no domínio OVH também usa o novo caminho.

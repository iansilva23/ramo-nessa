# Central do Motorista

A Central fica em `/motoristas`, no site existente, com interface responsiva amarela/preta e a logo oficial. O site inclui links na seção de motoristas e no rodapé. Não há aulas fictícias instaladas: até a primeira publicação, aparece o estado de preparação.

## Acesso e progresso

O motorista entra com **o mesmo usuário ou e-mail e senha já configurados no app**. A Central cria uma sessão separada pelo endpoint atual do Core, sem trocar a senha nem encerrar a sessão do aplicativo. Não foi criado um login compartilhado.

A sessão é mantida em cookie `__Host-rn_training`, `HttpOnly`, `Secure`, `SameSite=Strict`, sem domínio compartilhado, válido por no máximo um dia. A senha não é persistida e o token não é exposto ao JavaScript/localStorage. Cada leitura e alteração valida a sessão ao vivo em `/v1/auth/me/check`; motorista suspenso/sessão revogada não acessa o catálogo. O logout revoga apenas a sessão usada pela Central. O limite persistente de login continua no Core. A instalação deve manter o site acessível exclusivamente pelo gateway, que sobrescreve `X-Forwarded-For`; a Central encaminha ao Core somente o primeiro IP válido desse cabeçalho para manter o limite por IP real.

O botão **Concluir aula** salva a conclusão na conta do motorista em SQLite; abrir o vídeo não conclui automaticamente. É possível desmarcar. Não há certificação de que o vídeo foi assistido até o final, nem sincronização da posição do player.

## ADM

Abra **Site e aplicativos → Central do Motorista** no painel existente. As permissões continuam `communications:read/write`, validadas no Core em cada requisição administrativa.

1. Crie/renomeie os módulos e ajuste sua ordem.
2. Adicione uma aula com título, módulo e link HTTPS do YouTube. Descrição, duração e capa são opcionais. Sem capa enviada, aparece a miniatura do YouTube.
3. Organize a sequência com Subir/Descer aula. Desmarque **Exibir esta aula após publicar** para ocultar uma aula.
4. Escreva os avisos, se houver. Texto vazio oculta a chamada de avisos.
5. Use **Salvar rascunho das aulas**, confira **Prévia das aulas** e então **Publicar Central**.

Salvar/publicar a Central não altera nem publica o restante do site. Mudanças simultâneas retornam 409 para evitar sobrescrita. As versões anteriores podem ser restauradas para o rascunho; ainda é necessário publicar. O progresso dos motoristas permanece salvo. Uma aula removida/oculta deixa de contar no progresso visível; seu registro histórico é preservado.

O limite é de 20 módulos e 100 aulas; requisições de rascunho são limitadas a 512 KiB. Só é possível excluir um módulo vazio. Aulas sem link válido precisam ser corrigidas ou removidas antes de salvar, mesmo quando ocultas.

## YouTube

Envie os vídeos como **não listados**, mantenha a incorporação permitida e cole apenas o link do vídeo. Links `watch`, `youtu.be`, `shorts`, `live` e `embed` são reconhecidos. O sistema extrai o ID, nunca executa HTML enviado pelo ADM e incorpora o vídeo via `youtube-nocookie.com`, com política de referência que identifica o site ao player.

O acesso à Central exige login; o link não listado do próprio YouTube pode ser compartilhado e acessado fora dela. Disponibilidade, anúncios, restrições de idade/região e permissão de incorporação dependem do YouTube. Há um link para abrir cada vídeo no YouTube caso necessário. Referências: https://developers.google.com/youtube/player_parameters e https://support.google.com/youtube/answer/171780.

## Dados e atualização da VPS

Tabelas novas, aditivas, no volume SQLite já usado pelo site: `driver_training_state`, `driver_training_releases`, `driver_training_progress`. Capas usam o upload de imagem existente; rascunhos não ficam públicos. Auditoria reutiliza `site_audit`. O backup consistente existente inclui as novas tabelas automaticamente. Não apagar nem recriar o volume.

`deploy/staging/publish-driver-training.mjs SHA_COMPLETO` prepara a imagem do site e uma imagem do gateway derivada da imagem **ativa**, substituindo apenas `src/site-admin.js`. Isso preserva atualizações dos demais módulos do ADM. O script valida o editor anterior, origens, proxy e identidade dos containers, faz backup SQLite, mantém imagens para rollback e verifica as rotas após a ativação. Usa o snapshot JSON Compose que efetivamente criou o gateway (identificado pelos labels), preservando a configuração da atualização do troco. A cópia candidata muda somente `services.gateway.image` para o ID da imagem preparada; portas, montagens, redes, ambiente e definições dos outros serviços são mantidos. A normalização é usada apenas para verificar as montagens e o ambiente; a cópia mantém as strings e escapes originais do snapshot. Os manifests ficam em backup privado (diretório 0700, arquivos 0600) e nunca são impressos. Não muda Caddyfile, Core, Postgres, mapas, aplicativos ou regras financeiras. Em falha, restaura as imagens e a fonte anteriores; nunca restaura automaticamente o banco, preservando registros novos.

Executar somente na instalação esperada, com `sudo`, depois de buscar a branch e conferir o SHA. O script aceita somente os dois editores revisados, conferindo o SHA256 tanto da fonte local quanto do arquivo no container: o editor com rodapé da base do site e o editor da branch Android identificado na VPS em 25/11. Outras alterações continuam bloqueadas. Backups: `/var/backups/ramo-nessa-training/REVISAO_CURTA/`. Para executar sem trocar a branch/HEAD da VPS, extraia o script da revisão verificada para um arquivo temporário criado com `mktemp` e execute esse arquivo com `sudo node`, passando o mesmo SHA.

## Validação desta entrega

- TypeScript e build Next.js standalone aprovados.
- 15 testes do site e 184 testes do ADM aprovados.
- Integração HTTP de produção aprovada para site/formulário/ADM e para login da Central, cookie protegido, proteção de origem, limite de tentativas devolvido pelo Core, publicação, aula oculta, progresso por conta, sessão revogada e logout. Core simulado, SQLite temporário; sem contas/dados de produção.
- Teste opcional de navegador em `test/driver-training-http.mjs`, habilitado com `PLAYWRIGHT_MODULE` apontando para o módulo Playwright e `CHROMIUM_PATH` para o executável. Ele cobre login, player, conclusão, busca, filtros, menu móvel e logout. **Não concluído neste ambiente**: o Chromium local foi bloqueado por restrições de sockets; o navegador remoto não alcançou o servidor local.
- Script de publicação validado sintaticamente e com 5 testes de regressão para editores permitidos, divergência entre fonte/container, imagem do gateway, preservação da configuração da atualização do troco e valores padrão das origens (`node --test deploy/staging/driver-training-deploy.test.mjs`). A primeira tentativa na VPS parou na validação das imagens antes de alterar serviços; a adaptação para o snapshot ativo ainda não foi executada. Assim, login com motorista real, reprodução dos vídeos reais, conferência visual de celular/computador e verificação de Docker continuam pendentes antes de considerar a publicação homologada.

No diretório `apps/institutional-site`, rode `npm run check`, `npm test`, `npm run build`. Copie `public/` e `.next/static/` para `.next/standalone/` conforme o README, depois execute `node test/production-http.mjs`, `node test/site-production-http.mjs` e `node test/driver-training-http.mjs`. Os testes usam somente bancos temporários. No diretório `apps/admin`, rode `npm run check` e `npm test`.

A validação das origens segue os mesmos valores padrão do código do site: `PUBLIC_SITE_ORIGIN` ausente usa `https://ramonessa.com.br`; `ADMIN_SITE_ORIGIN` ausente usa `https://app.ramonessa.com.br`. Valores explícitos diferentes (inclusive vazios) continuam bloqueados. `TRUST_PROXY=true` segue obrigatório no Core. A conferência dessas variáveis é feita nos containers correspondentes; não é necessário defini-las no Core ou definir `TRUST_PROXY` no site.

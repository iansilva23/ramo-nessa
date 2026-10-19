# Asaas — exclusivamente repasses dos motoristas

O Mercado Pago continua sendo o motor de recebimentos, carteira e estornos. A Asaas não recebe corridas nem movimenta o lucro da empresa nesta integração. O provedor antigo de payouts e o pagamento manual são preservados, sem ativação implícita.

## Operação

- Financeiro → Controle de repasses mantém manual, semiautomático (seleção e confirmação no ADM) e automático (seg/qua/sex, 07h America/Fortaleza).
- Repasses normais reservam o saldo disponível integral, sem mínimo e sem taxa de antecipação.
- Antecipações continuam manuais e sujeitas à aprovação. Mínimo e taxa são editáveis pelo proprietário no mesmo painel; os padrões são R$80 e R$10.
- Novas solicitações usam a política atual; reservas existentes preservam sua taxa. Clientes antigos só podem solicitar com os padrões antigos. Se a política mudou, a API pede atualização/confirmação, sem cobrar uma taxa desconhecida.
- Configurar a integração não muda o modo atual para automático. Credenciais e o opt-in do servidor são independentes da escolha do modo pelo proprietário.

## Segurança do envio e conciliação

A Asaas não documenta um header de idempotência para criar transferências. Antes do POST, o Core grava `processing` com uma referência estável `asaas:<ambiente>:<payoutId>` sob o lock já existente do repasse. Uma tabela adicional registra a tentativa antes do POST, com hash do valor/destino. Somente o vencedor dessa criação envia.

Timeout, 5xx, autenticação inválida ou resposta inconclusiva **não** devolvem saldo e **não** repetem o POST. O repasse permanece reservado. A conciliação usa o ID conhecido ou procura `externalReference` exata em até cinco páginas de 100 transferências recentes, verificando valor, ambiente, modalidade e chave Pix. Uma busca incompleta não autoriza novo envio.

Se o processo parar entre a reserva da tentativa e o envio, ou se uma transferência não for encontrada, o sistema mantém o valor reservado para revisão operacional. Não existe botão de "forçar novo Pix". A resolução de uma tentativa inconclusiva exige conferir o histórico da conta Asaas e o registro interno antes de qualquer liberação. Essa escolha privilegia não pagar duas vezes; a recuperação não é garantidamente automática em toda falha.

O webhook autenticado recebe eventos de transferência, consulta o recurso canônico pela API e só então aplica o resultado ao ledger. Eventos repetidos são registrados e a baixa financeira continua idempotente. Eventos antigos não regressam o estado por confiar no payload: a consulta usa o estado atual da Asaas. `BLOCKED`, `PENDING`, `SCHEDULED` e `BANK_PROCESSING` não significam pago. Apenas `DONE` confirma; `FAILED`/`CANCELLED` devolvem a reserva através do ledger existente. Repasses Asaas em processamento não podem ser cancelados manualmente no ADM.

A referência exibida no banco local é interna. O detalhe no ADM mostra também o ID real da Asaas quando conhecido. As chamadas são limitadas aos hosts fixos da Asaas, sem redirects, com timeout e sem logging de respostas/credenciais.

## Configuração privada — sem ativar nesta entrega

Aplicar a migration **086** antes de iniciar este Core. Ela adiciona tabelas de tentativas/eventos e dois campos de política; não cria repasses nem envia dinheiro. Os valores padrão preservam a antecipação atual. A migration reinicia o modo como **manual**, uma única vez, para não herdar uma agenda automática armada de outro provedor. O proprietário poderá selecionar semiautomático ou automático após homologar a integração.

Os overlays `deploy/staging/compose.asaas.yml` e `deploy/prod/compose.asaas.yml` atuam apenas no Core e não substituem nenhuma configuração do Mercado Pago. Staging inclui o overlay pelo helper existente somente após opt-in explícito.

Exemplo de parâmetros não secretos no `.env` privado da VPS:

```dotenv
ASAAS_PAYOUTS_ENABLED=false
ASAAS_PAYOUT_MODE=sandbox
ASAAS_PAYOUT_START_AFTER=2026-10-18T00:00:00Z
ASAAS_API_KEY_HOST_FILE=/opt/ramo-nessa-private/asaas-api-key
ASAAS_WEBHOOK_TOKEN_HOST_FILE=/opt/ramo-nessa-private/asaas-webhook-token
```

A data acima é apenas exemplo. Na ativação real, definir o corte para NOVOS repasses daquela implantação. O adaptador recusa antecipações, reservas manuais e repasses anteriores ao corte. Não migrar reservas antigas para a Asaas automaticamente.

Criar os dois arquivos regulares privados (0600, legíveis pelo UID 1000 do Core), montados somente para leitura. O token de webhook é independente da API Key (32–255 caracteres, sem espaços). Não colocar segredos no GitHub, HTML, app, logs ou chat. O runtime também aceita `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` em ambiente, mas rejeita variável e arquivo simultâneos; os overlays preferem arquivos.

Para ativar após homologação, o servidor precisa de `DRIVER_PAYOUT_PROVIDER_NAME=asaas`, `ASAAS_PAYOUTS_ENABLED=true`, ambiente explícito, data de corte válida, PostgreSQL e ambos os segredos. O Compose overlay define o nome do provedor. Usar apenas credenciais do ambiente correspondente. Configurar o webhook na URL final HTTPS `/v1/webhooks/asaas/transfers` com os sete eventos `TRANSFER_*` tratados pelo adaptador e o token independente. Não usar o mecanismo de autorização de saques como se fosse esse webhook de eventos.

A conta Asaas precisa de saldo próprio; não há transferência automática de saldo do Mercado Pago para ela. Conferir também os mecanismos de autorização/limites da conta antes da homologação. Esta entrega não altera esses controles no painel Asaas.

## Aceite e retorno

O workflow isolado cobre concorrência, resposta perdida, recuperação, webhook repetido, rejeição, estado bloqueado, política dinâmica, ledger e repositórios PostgreSQL reais descartáveis. Nenhum teste acessa a conta do proprietário ou movimenta dinheiro real. Homologação contra a API sandbox com credenciais próprias ainda é etapa necessária; testes locais não comprovam a configuração da conta aprovada.

Antes de qualquer implantação, conferir a versão e os mounts atuais da VPS: ela recebeu alterações em outros chats. Preservar Caddy, site, web-dist, Firebase/Maps/OTP, pagamentos e backups. Não executar `git reset`, `clean`, apagar volumes ou usar comandos de atualização antigos.

Um retorno para Core anterior exige primeiro desativar a criação de repasses Asaas e avaliar os que já estão em processamento; não apontar outra API para essas reservas. As tabelas/ledger e registros da migration devem ser preservados, inclusive para conciliação. Não alterar mínimo/taxa enquanto clientes novos e API ainda não estiverem homologados juntos.

## Referências oficiais consultadas

- https://docs.asaas.com/reference/transferir-para-conta-de-outra-instituicao-ou-chave-pix
- https://docs.asaas.com/reference/recuperar-uma-unica-transferencia
- https://docs.asaas.com/reference/listar-transferencias
- https://docs.asaas.com/docs/retries-e-idempot%C3%AAncia
- https://docs.asaas.com/docs/webhook-para-transferencias
- https://docs.asaas.com/docs/sobre-os-webhooks

## Preparação sobre a versão de preços ativa

A branch de integração combina o PR #28 com `2ee07808d819bc73eb7377c5d273124ecd19acb0` (PR #29). O código do passageiro, os packages e o motor de cotação permanecem idênticos à versão de preços. A preparação usa o runtime inspecionado em 18/10 e não o HEAD antigo de `/opt/ramo-nessa`.

`prepare-asaas-pricing.mjs <commit completo>` recusa imagens/mounts diferentes, serviços sem saúde e qualquer histórico de migrations que não corresponda à candidata com somente 086 pendente. Cria imagens isoladas de Core/ADM e guarda inspeções completas, Compose e Caddy em diretório 0700 com arquivos 0600. Esses arquivos contêm configurações privadas: não publicar nem enviar no chat. A validação do Caddy ocorre em container descartável sem rede. Não troca imagens ativas, não modifica Caddy, não aplica migrations, não inclui credenciais Asaas e não ativa repasses.

A pasta web ativa é `/opt/ramo-nessa-web/releases/2ee07808d819/bundles`; o symlink legado aponta para outra versão e não deve orientar esta implantação. Core e gateway têm listas Compose distintas, preservadas no snapshot. Uma preparação interrompida não é apagada ou retomada automaticamente. Antes de ativação, ainda são necessários backup recente com teste de restauração, plano de retorno, homologação Asaas sandbox e validação coordenada do app do motorista.

### Backup e ensaio antes da ativação

`backup-asaas-pricing.mjs` usa o registro privado da candidata `5ffae7968796`, recusa alterações posteriores nos containers, imagens candidatas, Compose, Caddy ou histórico das migrations e verifica espaço livre antes de iniciar. Guarda dump PostgreSQL, documentos e imagens anteriores com hashes em pasta privada. Restaura o dump e os documentos somente em recursos descartáveis criados com nomes aleatórios. O PostgreSQL de teste usa `--network none` e nenhum porto publicado. Os probes recebem exclusivamente credenciais descartáveis e compartilham esse namespace sem rede externa; não recebem variáveis ou credenciais da conta real.

O probe aplica 086 somente na cópia, valida os padrões, grava uma política customizada, repete o runner para provar que a configuração não é resetada outra vez, consulta a política com o repositório antigo e compara fingerprints de todas as tabelas de negócio antes/depois. Exclui apenas histórico de migrations, configurações de repasse (alteração esperada) e novas tabelas Asaas. A comparação é uma evidência de integridade das linhas da cópia, não um teste de todas as operações do Core antigo. Os recursos descartáveis são removidos; arquivos privados de backup são mantidos. Nenhum serviço ativo é parado ou reiniciado e o banco ativo permanece na 085.

O backup de documentos ocorre com o sistema online. O tar deve concluir sem avisos de alteração; seu conteúdo é extraído e relido em volume isolado. Não é um snapshot atômico conjunto do banco e filesystem. Não substitui uma janela controlada de escrita quando o volume estiver recebendo alterações simultâneas. O site e sua SQLite não são atualizados por esta implantação; esta etapa não cria novo backup do SQLite do site.

O workflow inclui um ensaio real de dump/restauração em PostgreSQL offline, migração e probes com imagens Docker dos dois Cores. A execução completa do preparador/backup depende dos fingerprints reais da VPS e só é comprovada após o operador executá-los. Não existe ativação automática depois do backup.

### Exercício com a API Sandbox e dados separados

`run-asaas-sandbox.mjs` usa exclusivamente a chave privada em `/opt/ramo-nessa-private/asaas-sandbox/api-key`. Cria um banco novo `ramo_asaas_sandbox` em volume e rede próprios, sem portas publicadas e sem montar dados/configurações de produção. O worker usa a imagem candidata já preparada e os repositórios/adapter compilados, cria uma corrida/carteira fictícias e solicita exatamente R$5 para `cliente-a00001@pix.bcb.gov.br`, chave de homologação publicada em https://docs.asaas.com/docs/testing-transfers.md. O fluxo consulta primeiro o saldo virtual.

O adapter fixa o host Sandbox; o wrapper restringe os pedidos ao mesmo host e grava uma intenção antes do único POST permitido na sessão. A sessão persistida e o volume são reutilizados em novas execuções. Respostas inconclusivas não autorizam novo envio. Não apagar a sessão ou o volume para tentar de novo: consultar e reconciliar o registro existente. O PostgreSQL privado é parado ao final para poupar memória; os dados ficam preservados. Não há limpeza automática de registros remotos.

O exercício verifica envio, conciliação canônica e baixa única no ledger. O replay autenticado local não equivale a receber um webhook pela internet: o resultado mantém `externalWebhookDeliveryVerified=false`. A entrega externa do webhook segue como aceite separado obrigatório antes de ativar repasses reais. Nenhum endpoint público ou Caddy é alterado nesta etapa.

O ensaio CI usa transporte simulado, banco PostgreSQL real e rede sem acesso externo, incluindo resposta perdida, concorrência e reinício do worker. Não utiliza a conta ou chave do proprietário. O resultado contra a API real Sandbox só será conhecido após execução na VPS.

### Temporary public Sandbox receiver (before app activation)

`prepare-asaas-sandbox-webhook.mjs --prepare` uses the existing private lab
session and its already completed R$5 transfer. It does **not** create any new
transfer or register a webhook at Asaas. The active Core, database, pricing,
Mercado Pago and application bundles are not replaced. The Asaas feature remains
disabled in the app.

The script starts the stopped lab PostgreSQL and a small receiver from the
prepared candidate image, with no published host port. Only the receiver joins
the gateway network; the lab PostgreSQL stays on its private network. The
receiver uses the Sandbox token and key from private mounts, accepts one exact
POST path, limits the body to 64 KiB, and authenticates before reading it. Its
Asaas transport permits only canonical GET requests for a transfer UUID; it has
no payout creation route, job or POST transport. HTTP 200 follows durable event
processing; API/database failures return a retryable status. No raw payload,
key, token or customer information is written to its receipt journal.

A hash-guarded insertion adds `handle /__asaas_sandbox/transfers` immediately
before the existing API marker in the actual mounted Caddyfile. All existing
bytes remain unchanged. It validates the candidate, preserves the bind-mounted
inode, and sends `SIGUSR1` to the verified `caddy run --config` process with
`admin off`. It never recreates or restarts the gateway. Current site, API,
admin and both Web routes are checked before/after, as are active container IDs
and start times. An authenticated local probe reuses the already paid Sandbox
transfer and verifies a single ledger entry. This probe is explicitly marked
local and **does not count as Asaas webhook delivery acceptance**.

Private journal, original/candidate Caddyfiles and receiver scripts are kept at
`/var/lib/ramo-nessa-asaas-sandbox/public-webhook`. A failed activation attempts
to restore the original configuration using the same reload, preserving evidence
and refusing to overwrite concurrent changes. `--remove` restores the guarded
original configuration, checks the service routes, removes only the labelled
receiver and stops the lab database only if this stage had started it. It keeps
the test data and receipts. If another deployment has edited the gateway, it
stops for review instead of reverting that deployment.

The lab database and receiver remain running while awaiting external acceptance;
no restart policy or host port is added. Do not rerun an older Sandbox worker
controller during this phase, because it stops the lab database at completion.
The updated worker controller explicitly refuses to run while the receiver is
active. Registration in the **Asaas Sandbox** dashboard and an authenticated
provider-originated event remain separate pending steps. An already finished
transfer must not be assumed to emit historical events to a newly registered
subscription. Clean up the temporary route and subscription after acceptance.

CI covers HTTP authentication, bounded/invalid bodies, duplicate deliveries,
retry on failure, actual compiled provider/repositories against a disposable
PostgreSQL with fake canonical transport, and activation/rollback using Caddy
2.11.7 with a read-only bind mount and unchanged container start time. These tests
do not claim external Asaas delivery or real-account authorization acceptance.

### Second Sandbox exercise for provider-originated delivery

`run-asaas-webhook-exercise.mjs` is intended only after the operator registers the
public Sandbox webhook. Its preflight reads the Sandbox webhook configuration,
requiring the exact URL, enabled/uninterrupted queue, v3, sequential delivery,
exactly the seven supported transfer events and a matching token when returned
by the API. It requires the private receiver and lab PostgreSQL to remain running
with their original image/session/network identity and the guarded Caddyfile.
It does not update registrations, services, migrations or gateway configuration.

The additional R$5 fictitious transfer uses a new persistent session under
`/var/lib/ramo-nessa-asaas-sandbox/webhook-exercise/data`, new ride/payment/driver
and payout identifiers, but the same lab database and registered receiver token.
It mounts that directory into the already tested worker at `/audit/data`.
The first session's files and transfer stay unchanged. Repeating this controller
uses the same second session and durable POST-intention journal; it does not
request another transfer, restart the receiver or stop its database. Authorization
requested by the Sandbox dashboard remains an operator action.

Acceptance requires an authenticated nonlocal `TRANSFER_DONE` receipt matching
this second transfer, the canonical local payout state `paid`, exactly one paid
ledger entry and one POST intention in this session. Empty logs, a local replay,
a different transfer, an unfinished payout or duplicate ledger entries cannot
pass. The operator should also confirm HTTP 200 in the Asaas webhook delivery
logs. CI rehearses two independent worker sessions and repeated execution against
real PostgreSQL with fake transport, preserving one POST/ledger entry per session;
this does not claim live external delivery.

### Prepare the Core/ADM activation plan after Sandbox acceptance

`prepare-asaas-activation-plan.mjs` prepares private candidate and rollback Compose
files only. It requires the accepted second Sandbox exercise and the original
prepared images/verified backup. It resolves the separate Core and gateway Compose
file chains recorded on their live containers, using each active staging helper
and environment file. It compares the resolved environment to the container plus
image defaults, verifies mounts/networks, and refuses Compose source changes from
the already captured configuration instead of overwriting work from another chat.
Compose already escapes literal dollars in its serialized output. That output is
kept ready for re-input, decoded only for comparison against actual container
environment values, then checked through another Compose resolution. Sources, sensitive resolved
models and rollback configurations remain in a root-only directory.

The plan contains only the target service, with dependencies/build removed, pull
policy never, explicit existing network aliases and external references to existing
named networks/volumes. It preserves all configured provider/payment values except
setting the driver payout provider to Asaas **disabled**. No Sandbox key/token is
mounted into the active Core and no transfer is created. A running payout provider
or already armed Asaas configuration causes preparation to stop for review.

This command does not apply migration 086, replace/restart any container, edit the
active Caddyfile, change Git files or close the temporary receiver. Its final plan
records the current temporary Caddy hash and the expected post-cleanup original.
Before activation, the Sandbox subscription/receiver must be closed and a fresh
backup made. Migration 086 explicitly resets payout mode to manual. Updating the
driver clients to consume dynamic payout terms remains necessary before exposing
changed anticipation terms or enabling the integration for real use.

CI checks contract scope, source/environment drift, unchanged Mercado Pago/provider
settings, mount/network references and literal-dollar handling. A Docker Compose
rehearsal creates only stopped disposable containers, checks candidate and rollback
environments and verifies existing volumes/networks are retained. No production
service or account credentials are used in this rehearsal.

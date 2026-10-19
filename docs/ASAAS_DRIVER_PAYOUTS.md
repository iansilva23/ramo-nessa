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

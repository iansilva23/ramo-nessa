# Plano de Controle Administrativo — Ramo Nessa

## Objetivo

O Core possui um plano administrativo separado da autenticação de Passageiro e
Motorista. O objetivo inicial é permitir provisionar, aprovar e suspender motoristas
com rastreabilidade, sem expor uma senha mestra no código ou no navegador.

## Credenciais

As chaves têm prefixo `rn_admin_`, alta entropia e são exibidas em claro **uma
única vez** no momento da criação. O banco persiste somente SHA-256. Cada chave
também possui expiração obrigatória; o padrão é 90 dias.

Nunca:

- commitar a chave no Git;
- colocar a chave em `.env.example`;
- enviar a chave para o app Passageiro ou Motorista;
- embutir a chave no futuro frontend web do Admin.

### Criar uma chave

No ambiente seguro que possui `DATABASE_URL`:

```bash
npm run admin:create-key -- --name="Operacao Jeri" --days=90
```

Por padrão a chave recebe todos os escopos administrativos atuais. Para restringir:

```bash
npm run admin:create-key -- --name="Leitura Auditoria" --scopes=audit:read
```

Escopos atuais:

- `drivers:auth:read`
- `drivers:auth:write`
- `drivers:profile:read`
- `drivers:profile:write`
- `drivers:documents:read`
- `drivers:documents:write`
- `passengers:auth:read`
- `passengers:auth:write`
- `rides:read`
- `rides:write`
- `fleet:read`
- `finance:read`
- `finance:write`
- `pricing:read`
- `pricing:write`
- `audit:read`

### Revogar uma chave

```bash
npm run admin:revoke-key -- --key-id=<uuid>
```

A revogação é persistente e a credencial deixa de autenticar imediatamente.

## API

As rotas operacionais abaixo aceitam uma das duas credenciais, sempre respeitando
o mesmo escopo da operação:

```http
Authorization: Bearer rn_admin_<token>
```

ou, para o painel humano autenticado com senha + TOTP:

```http
Authorization: Bearer rn_admin_session_<token>
```

O Core identifica primeiro o prefixo da sessão humana para que ela nunca seja
interpretada como API key.

### Dashboard operacional

`GET /v1/admin/dashboard`

Escopo: `rides:read`. Retorna contagens reais de corridas ativas, em busca de
motorista, com motorista a caminho/chegou, em viagem, concluídas nas últimas 24h e
canceladas nas últimas 24h, além das corridas ativas mais recentes.

### Mapa da frota

`GET /v1/admin/fleet`

Escopo: `fleet:read`. Retorna somente motoristas online, incluindo livres,
reservados, ocupados e em corrida. Cada item inclui identificação operacional do
motorista/veículo, categorias, serviço atual quando houver, latitude/longitude e
idade da última posição. O Core classifica GPS com mais de 120 segundos como
atrasado por padrão.

O painel atualiza esta visão a cada 5 segundos enquanto a aba **Frota** está
aberta. A sessão Admin continua no header Bearer e nunca é anexada à URL dos
tiles. Os tiles OpenStreetMap são apenas infraestrutura de desenvolvimento; antes
da produção devem ser substituídos pelo provedor comercial previsto no roadmap.

### Catálogo de preços e zonas

`GET /v1/admin/pricing/catalog`

Escopo: `pricing:read`. Retorna o catálogo comercial v1 autoritativo do Core em
modo **somente leitura**: versão, categorias, períodos, zonas, comissão,
política de coleta, adicionais, localidades de Preá/Jijoca e rotas fixas.

O catálogo ativo continua protegido e nunca é alterado diretamente.

O fluxo de escrita usa versões publicáveis:
- `GET /v1/admin/pricing/versions` — lista versões;
- `POST /v1/admin/pricing/versions` — cria rascunho a partir do catálogo efetivo;
- `GET /v1/admin/pricing/versions/:id` — abre versão e prévia;
- `PATCH /v1/admin/pricing/versions/:id` — edita somente rascunhos;
- `POST /v1/admin/pricing/versions/:id/publish` — publica com vigência imediata ou futura.

Leitura exige `pricing:read`; escrita/publicação exige `pricing:write`.
Criação, alteração e publicação geram auditoria. O `quote-engine` resolve a
versão publicada efetiva pelo horário, e cada corrida congela a referência da
versão comercial usada.

A edição desta etapa cobre rotas fixas, tarifas por localidade e políticas
versionadas por categoria. Cada categoria pode ser ativada/desativada e pode
exigir 4x4 quando a viagem cruza o limite de Jericoacoara. A exigência é
congelada na corrida no momento da criação/preparação, evitando que uma mudança
futura reclassifique uma viagem já existente.

As quatro zonas técnicas suportadas (`jericoacoara`, `prea`, `jijoca` e
`external`) podem ser ativadas/desativadas dentro do mesmo fluxo versionado.
Localidades de Preá/Jijoca e destinos externos aprovados podem ser adicionados ou
removidos em rascunho. Hubs centrais e localidades referenciadas por rotas fixas
não podem ser removidos. A cotação e a validação de GPS usam o catálogo efetivo,
evitando divergência entre configuração do Admin e runtime.

### Diretório de passageiros

`GET /v1/admin/passengers?limit=25&query=&status=&cursor=`

Escopo: `passengers:auth:read`. A operação é somente leitura e retorna identidades
de acesso do app Passageiro com resumo real de `total`, `active` e `suspended`.

### Ficha operacional de passageiro

`GET /v1/admin/passengers/:passengerId`

Exige `passengers:auth:read` e `rides:read`. Retorna a identidade exata,
resumo de corridas e histórico recente somente leitura. A resposta não expõe
latitude ou longitude de embarque/destino.

### Bloquear/desbloquear passageiro

`PATCH /v1/admin/passengers/:passengerId/auth/status`

Escopo: `passengers:auth:write`. Corpo: `{"status":"suspended"}` para bloquear
ou `{"status":"active"}` para desbloquear.

Ao bloquear, o Core revoga imediatamente todas as sessões ativas do passageiro.
Ao desbloquear, sessões antigas **não** são restauradas: o passageiro precisa fazer
novo login/OTP. Cadastro, viagens e histórico permanecem preservados. A mudança é
registrada na auditoria com status anterior, novo status e quantidade de sessões
revogadas.

### Financeiro read-only

`GET /v1/admin/finance?limit=25`

Escopo: `finance:read`. Retorna pagamentos recentes, resumo contábil,
comissão reconhecida, saldos agregados, escrow e solicitações de saque.
A rota é somente leitura e não executa movimentações financeiras.

### Política futura de dinheiro

`GET /v1/admin/payment-policy`

Escopo: `finance:read`. Retorna a configuração persistente de dinheiro,
prontidão de ativação e o limite futuro de dívida de comissão.

`PATCH /v1/admin/payment-policy`

Escopo: `finance:write`. O contrato já permite desligamento seguro, porém
`cashEnabled: true` retorna `409 CASH_ACTIVATION_BLOCKED` até existir o fluxo
cash completo de dívida de comissão, limite operacional e liquidação.

A configuração nasce com `cashEnabled=false`. O app Passageiro continua sem
oferecer dinheiro e o Core continua aceitando apenas Pix, cartão e carteira.

### Consultar autenticação de motorista

`GET /v1/admin/drivers/:driverId/auth`

Escopo: `drivers:auth:read`.

### Provisionar/aprovar motorista

`PUT /v1/admin/drivers/:driverId/auth`

Escopo: `drivers:auth:write`.

Corpo:

```json
{
  "phone": "88999991234",
  "status": "active"
}
```

Se `status` for omitido, o motorista nasce como `suspended` e precisa ser
aprovado explicitamente. O mesmo telefone não pode pertencer a dois motoristas e o
mesmo motorista não pode ser silenciosamente remapeado para outro telefone.

### Alterar status

`PATCH /v1/admin/drivers/:driverId/auth/status`

Escopo: `drivers:auth:write`.

Corpo:

```json
{
  "status": "suspended"
}
```

Ao suspender, todas as sessões ainda ativas do motorista são revogadas no mesmo
fluxo de negócio.

### Cadastro de motorista e veículo

`GET /v1/admin/drivers/:driverId/registry`

Escopo: `drivers:profile:read`.

`PUT /v1/admin/drivers/:driverId/registry`

Escopo: `drivers:profile:write`. Cria/atualiza nome e veículo, mas preserva os
status cadastrais existentes. Um novo cadastro nasce `pending`; edição de dados
nunca aprova silenciosamente o motorista ou o veículo.

`PATCH /v1/admin/drivers/:driverId/registry/status`

Escopo: `drivers:profile:write`. Permite alterar explicitamente
`profileStatus` e/ou `vehicleStatus` entre `pending`, `approved` e
`suspended`.

O cadastro contém placa normalizada, marca, modelo, ano, cor, categorias,
capacidade e flag 4x4. Ele é **separado** de `driver_supply`, que continua sendo
apenas a projeção operacional usada pelo matching. Documentos sensíveis ainda não
fazem parte desta superfície.

### Documentos do motorista

Tipos iniciais:

- `driver_license` — CNH;
- `vehicle_registration` — CRLV.

O Core não armazena o arquivo no PostgreSQL. Ele guarda apenas referência privada
opaca, SHA-256, MIME, tamanho, validade, versão atual e estado de revisão. A API de
consulta nunca devolve `storage_key` nem o checksum ao navegador.

`GET /v1/admin/drivers/:driverId/documents`

Escopo: `drivers:documents:read`.

`PUT /v1/admin/drivers/:driverId/documents/:documentType`

Escopo: `drivers:documents:write` e **somente API key server-to-server**. Essa
rota é destinada ao futuro serviço de storage depois de um upload privado concluído.
A sessão humana não pode fabricar uma referência de arquivo.

`PATCH /v1/admin/drivers/:driverId/documents/:documentType/review`

Escopo: `drivers:documents:write`. Transições permitidas:

- `pending → approved`;
- `pending → rejected` com motivo;
- `approved → expired`.

Uma nova submissão preserva o histórico e vira a única versão atual. Documento
vencido não pode ser aprovado.

Ainda faltam o provider de storage privado, upload real, validação do objeto e URL
assinada de curta duração para visualização.

### Auditoria

`GET /v1/admin/audit?limit=50`

Escopo: `audit:read`. O limite permitido é 1–100.

A auditoria registra o tipo de ator (`api_key` ou `user`), operador, ação,
motorista, data e metadados operacionais. Não registra o token administrativo nem
o telefone do motorista nos metadados.

## Painel web

O painel web consome as rotas administrativas com sessão humana de curta duração e
MFA. API keys `rn_admin_` permanecem restritas a CLI/integrações server-to-server
e nunca devem ser colocadas no browser.

## Produção

Antes de liberar o Admin para uso público/Internet:

- colocar o Core atrás de TLS e proxy confiável;
- restringir rede/origem administrativa quando possível;
- criar chaves separadas por operador/integração;
- aplicar princípio do menor privilégio;
- monitorar e revisar `admin_audit_log`;
- rotacionar/revogar chaves periodicamente.


## Login humano do Admin

O painel web deve usar uma identidade humana própria, separada das chaves
`rn_admin_`. O Core possui a fundação de autenticação com:

- senha derivada com `scrypt`;
- TOTP de 6 dígitos;
- segredo TOTP cifrado com AES-256-GCM;
- sessão opaca `rn_admin_session_` com duração de 2 horas;
- somente SHA-256 da sessão persistido;
- bloqueio de reutilização do mesmo TOTP;
- rate-limit persistente por e-mail e IP, com buckets HMAC;
- suspensão do usuário invalidando autenticação.

### Segredos de produção

`ADMIN_MFA_ENCRYPTION_KEY` deve ser uma chave aleatória de 32 bytes em base64.
`ADMIN_LOGIN_RATE_LIMIT_SECRET` deve ter pelo menos 32 caracteres.

### Criar o primeiro usuário humano

No ambiente seguro com `DATABASE_URL` e a chave MFA configurada:

```bash
npm run admin:create-user -- --name="Operacao Jeri" --email="admin@example.com"
```

O bootstrap mostra uma senha inicial e o segredo/URI TOTP uma única vez.

### Rotas de sessão

- `POST /v1/admin/auth/login` — e-mail + senha + TOTP;
- `GET /v1/admin/auth/me` — valida a sessão curta;
- `DELETE /v1/admin/auth/session` — revoga a sessão.

O token de sessão humana pode ser mantido apenas em memória pelo frontend enquanto
o painel estiver aberto. Não usar `localStorage` para a sessão Admin.


## Diretório administrativo de viagens

O escopo `rides:read` protege consulta/histórico de corridas. A ação sensível de cancelamento exige `rides:write`.

### Listagem

```http
GET /v1/admin/rides?scope=active&limit=25
Authorization: Bearer rn_admin_session_<token>
```

Parâmetros:

- `scope=active|all` — `active` é o padrão;
- `state=<RideState>` — quando informado, filtra um estado exato;
- `query=<texto>` — busca por ID da corrida, passageiro, motorista ou motorista reservado;
- `from=<data>` / `to=<data>` — histórico por período de criação, aceitando data ISO ou `YYYY-MM-DD`;
- `limit=1..100`;
- `cursor=<opaco>` — paginação estável por `updated_at + id`.

A resposta contém `items` e `nextCursor`. O cursor deve ser tratado como opaco pelo cliente.

### Detalhe

```http
GET /v1/admin/rides/<uuid>
Authorization: Bearer rn_admin_session_<token>
```

O detalhe retorna estado, pagamento, participantes, rota comercial, categoria,
período tarifário, quantidade de passageiros, distâncias conhecidas, snapshot da
tarifa e timestamps. Coordenadas exatas não são expostas nesta primeira superfície
administrativa.

### Cancelamento administrativo

```http
POST /v1/admin/rides/<uuid>/cancel
Authorization: Bearer rn_admin_session_<token>
Content-Type: application/json

{"reason":"motivo operacional"}
```

Escopo: `rides:write`. O Core aceita cancelamento administrativo somente antes
do início da viagem: `PAID`, `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`,
`DRIVER_ARRIVING` e `DRIVER_ARRIVED`. `IN_PROGRESS` permanece bloqueado até
existir política explícita de compensação.

A operação cancela ofertas, libera reserva/motorista e registra auditoria de forma
idempotente. Pagamento em carteira é estornado imediatamente pelo ledger e a
corrida termina em `REFUNDED`. Pix/cartão terminam em `REFUND_PENDING` com
`pending_external_gateway`; o Admin não finge que o estorno externo aconteceu
antes da confirmação do gateway real.

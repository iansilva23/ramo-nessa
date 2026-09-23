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
- `passengers:auth:read`
- `rides:read`
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

### Diretório de passageiros

`GET /v1/admin/passengers?limit=25&query=&status=&cursor=`

Escopo: `passengers:auth:read`. A operação é somente leitura e retorna identidades
de acesso do app Passageiro com resumo real de `total`, `active` e `suspended`.

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

O escopo `rides:read` também protege a navegação read-only de corridas.

### Listagem

```http
GET /v1/admin/rides?scope=active&limit=25
Authorization: Bearer rn_admin_session_<token>
```

Parâmetros:

- `scope=active|all` — `active` é o padrão;
- `state=<RideState>` — quando informado, filtra um estado exato;
- `query=<texto>` — busca por ID da corrida, passageiro, motorista ou motorista reservado;
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

Esta fase é **somente leitura**. Cancelamento administrativo não foi adicionado
porque precisa respeitar, numa única operação transacional, estado da corrida,
reembolso e ledger financeiro.

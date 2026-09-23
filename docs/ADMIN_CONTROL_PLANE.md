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
- `audit:read`

### Revogar uma chave

```bash
npm run admin:revoke-key -- --key-id=<uuid>
```

A revogação é persistente e a credencial deixa de autenticar imediatamente.

## API

Todas as rotas abaixo exigem:

```http
Authorization: Bearer rn_admin_<token>
```

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

A auditoria registra operador, ação, motorista, data e metadados operacionais. Não
registra o token administrativo nem o telefone do motorista nos metadados.

## Painel web futuro

O painel web não deve consumir esses endpoints colocando uma API key no browser.
Ele deve ganhar autenticação humana própria e uma sessão administrativa de curta
duração, com MFA quando o produto entrar em operação real.

## Produção

Antes de liberar o Admin para uso público/Internet:

- colocar o Core atrás de TLS e proxy confiável;
- restringir rede/origem administrativa quando possível;
- criar chaves separadas por operador/integração;
- aplicar princípio do menor privilégio;
- monitorar e revisar `admin_audit_log`;
- rotacionar/revogar chaves periodicamente.

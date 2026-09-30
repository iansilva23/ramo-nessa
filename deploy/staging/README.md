# Homologação em VPS — Ramo Nessa

Ambiente público de homologação, separado de `deploy/prod`.

Objetivos:
- PostgreSQL, migrations, Core, Admin e HTTPS reais no VPS;
- banco e storage persistentes de homologação;
- deploy, reinício, backup, restore e acesso administrativo;
- integrar Mercado Pago, Firebase, SMS e Google Maps depois, uma etapa por vez.

## Segurança inicial

Use apenas dados fictícios. O ambiente começa com identidade de desenvolvimento
desabilitada, OTP sem entrega, Push desabilitado, Mercado Pago sem token,
Google Routes/Places em mock interno e Payouts desabilitado.

## Infraestrutura alvo

- Amazon Lightsail;
- São Paulo (`sa-east-1`);
- um VPS Linux inicialmente;
- Core, PostgreSQL e gateway em containers separados;
- PostgreSQL e Core sem porta pública;
- Caddy publica apenas 80/443;
- SSH administrativo por chave.

## Preparação

1. Aponte um subdomínio exclusivo de homologação para o IP estático do VPS.
2. Gere o ambiente:

```bash
node deploy/staging/generate-env.mjs
```

3. Edite somente `APP_DOMAIN` e `ACME_EMAIL`.
4. Valide:

```bash
node deploy/staging/validate-env.mjs
docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml config > /dev/null
```

5. Suba:

```bash
node deploy/staging/start.mjs
```

Valide:
- `https://<APP_DOMAIN>/health`
- `https://<APP_DOMAIN>/ready`
- `https://<APP_DOMAIN>/admin/`

## Conta proprietária

```bash
node deploy/staging/create-admin.mjs --name="Seu nome" --email="seu@email.com"
node deploy/staging/set-owner.mjs --user-id=<UUID>
```

O segundo comando grava o mesmo UUID em `ADMIN_OWNER_USER_ID` e
`ADMIN_PAYOUT_APPROVER_USER_ID` e recria apenas o Core.

## Backup e restore drill

```bash
node deploy/staging/backup.mjs --output-dir=/var/backups/ramo-nessa-staging
node deploy/staging/verify-backup.mjs --backup-dir=/var/backups/ramo-nessa-staging/<snapshot>
node deploy/staging/restore-drill.mjs --backup-dir=/var/backups/ramo-nessa-staging/<snapshot>
```

Nunca use `docker compose down -v` para resolver falhas.
Nunca versione `.env`, tokens, TOTP, chaves privadas ou Service Accounts.

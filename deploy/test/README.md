# Ambiente de teste — Ramo Nessa

Este stack sobe o primeiro ambiente **same-origin** do Admin:

- PostgreSQL privado;
- migrations em etapa própria;
- Core privado na rede Docker;
- gateway Caddy como única porta publicada;
- painel em `/admin/`;
- API em `/v1/**`;
- health/readiness em `/health` e `/ready`.

O navegador não precisa de CORS administrativo e nenhuma API key é colocada no
frontend.

## 1. Subir

Na raiz do repositório:

```bash
node deploy/test/start.mjs
```

Na primeira execução o script cria `deploy/test/.env` com segredos aleatórios.
O arquivo é ignorado pelo Git.

URL padrão:

```text
http://127.0.0.1:8080/admin/
```

## 2. Criar o primeiro usuário Admin

Com o stack pronto:

```bash
node deploy/test/create-admin.mjs \
  --name="Seu nome" \
  --email="seu@email.com"
```

A saída mostra uma única vez:

- senha inicial;
- segredo TOTP;
- URI `otpauth://`.

Cadastre o TOTP em um autenticador e guarde as credenciais fora do Git.

## 3. Encerrar

```bash
docker compose \
  --env-file deploy/test/.env \
  -f deploy/test/compose.yml \
  down
```

Para apagar também o banco de teste:

```bash
docker compose \
  --env-file deploy/test/.env \
  -f deploy/test/compose.yml \
  down -v
```

## Smoke E2E

```bash
node deploy/test/smoke.mjs
```

O smoke usa um projeto Docker efêmero e:

1. gera segredos temporários;
2. sobe PostgreSQL, migrations, Core e gateway;
3. confirma `/ready` e `/admin/`;
4. cria um Admin temporário;
5. faz login real com senha + TOTP;
6. valida `/v1/admin/auth/me`;
7. provisiona e aprova um motorista;
8. confirma auditoria com ator humano;
9. faz logout;
10. prova que o token revogado recebe 401;
11. destrói containers, volume e arquivo de ambiente.

Nenhuma credencial do smoke é impressa ou persistida.

## Segurança do gateway

O gateway:

- publica somente uma porta;
- não publica a porta do Core;
- mantém Admin e API na mesma origem;
- aplica CSP com `connect-src 'self'` e `frame-ancestors 'none'`;
- bloqueia embedding em iframe;
- envia `nosniff` e `no-referrer`;
- desabilita câmera, microfone e geolocalização;
- usa `no-store` para os arquivos do painel durante esta fase de teste.

Este stack é para teste controlado. Produção deve acrescentar TLS real, domínio,
secret manager, backup, monitoramento e política de atualização de imagens.

# Produção do Ramo Nessa Core

Este documento descreve o contrato mínimo de execução do Core em produção.

## Imagem

O `Dockerfile` usa Node.js 22, compila TypeScript para `dist/` e executa o
processo como usuário `node` sem privilégios. Dependências de desenvolvimento não
ficam na imagem final.

Build local:

```bash
docker build -t ramo-nessa-core ./backend/core
```

## Ordem de deploy

Migrations são uma etapa explícita de release. O servidor **não altera schema no
boot**.

1. disponibilizar as variáveis/segredos do ambiente;
2. executar `npm run db:migrate:prod` usando a mesma release;
3. iniciar/atualizar as instâncias do Core;
4. aguardar `GET /ready` retornar HTTP 200;
5. só então enviar tráfego para a nova instância.

O runner de migrations possui advisory lock e checksum, permitindo múltiplas
tentativas sem editar migrations já aplicadas.

## Probes

- `GET /health`: liveness do processo; não consulta dependências externas.
- `GET /ready`: readiness; retorna 200 somente quando o Core aceita tráfego e o
  PostgreSQL responde.

Durante shutdown, readiness passa a falhar antes de o processo fechar conexões.

## Encerramento

`SIGTERM` e `SIGINT` iniciam shutdown gracioso:

1. a instância deixa de ficar ready;
2. conexões realtime recebem fechamento de servidor;
3. o HTTP para de aceitar novas conexões;
4. o pool PostgreSQL é encerrado;
5. o processo termina.

`SHUTDOWN_TIMEOUT_MS` limita quanto tempo a instância pode esperar antes de
forçar o encerramento das conexões HTTP.

## Logs

Logs do Core são JSON por linha. Requests HTTP incluem:

- `requestId`;
- método;
- pathname sem query string;
- status HTTP;
- duração em milissegundos.

Corpos de request, header Authorization, token OTP, telefone e credenciais não são
registrados.

O Core aceita `x-request-id` somente quando ele possui formato simples e tamanho
limitado; caso contrário gera UUID próprio.

## Segredos

Nunca colocar no Git:

- `DATABASE_URL`;
- `DB_SSL_CA`;
- `OTP_HASH_SECRET`;
- `OTP_RATE_LIMIT_SECRET`;
- `OTP_WEBHOOK_TOKEN`;
- tokens administrativos;
- chaves de gateway/pagamento.

## TLS e proxy

O container escuta HTTP internamente. TLS deve terminar no load balancer/reverse
proxy da infraestrutura.

`TRUST_PROXY=true` só pode ser usado quando o proxy confiável sobrescreve
`X-Forwarded-For`; caso contrário mantenha `false`.


## Firebase Cloud Messaging

O método recomendado para produção é manter o JSON da Service Account fora do
repositório e montá-lo como arquivo somente-leitura no host/container.

Variáveis do Core:

```bash
PUSH_PROVIDER=fcm
FIREBASE_SERVICE_ACCOUNT_FILE=/run/secrets/ramo-nessa-firebase.json
```

O arquivo deve ser o JSON baixado no Firebase Console em
Configurações do projeto -> Contas de serviço -> Firebase Admin SDK.

Nunca copie esse JSON para o Git, para a imagem Docker ou para logs.
No host, restrinja as permissões do arquivo e, se o Core rodar em container,
monte-o como volume/secret somente-leitura em
`/run/secrets/ramo-nessa-firebase.json`.

A configuração por `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` continua aceita como
alternativa, mas o arquivo montado é preferível.


## Mercado Pago

O Core usa Checkout Transparente via **Orders API** para Pix. O Access Token é
credencial privada e nunca deve ser enviado ao app ou versionado no Git.

Ambiente de teste:

```bash
MERCADO_PAGO_MODE=test
MERCADO_PAGO_ACCESS_TOKEN_TEST=<secret>
MERCADO_PAGO_WEBHOOK_SECRET=<secret>
```

Produção:

```bash
MERCADO_PAGO_MODE=production
MERCADO_PAGO_ACCESS_TOKEN=<secret>
MERCADO_PAGO_WEBHOOK_SECRET=<secret>
```

Endpoint para configurar nas notificações de Orders do Mercado Pago:

```text
https://<dominio-do-core>/v1/webhooks/mercado-pago/orders
```

O Core valida `x-signature` e `x-request-id`, consulta a Order diretamente
no Mercado Pago e somente depois atualiza pagamento/corrida.

Para Pix, o identificador da Order é persistido como referência do processador,
permitindo consulta e reembolso idempotentes.

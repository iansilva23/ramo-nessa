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
- chaves de gateway/pagamento;
- `GOOGLE_MAPS_SERVER_API_KEY`;
- `FIREBASE_SERVICE_ACCOUNT_JSON` e o conteúdo de qualquer arquivo de Service Account Firebase.

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

O Core aceita a Service Account por **uma destas duas formas**:
`FIREBASE_SERVICE_ACCOUNT_JSON` (JSON completo vindo de secret) ou
`FIREBASE_SERVICE_ACCOUNT_FILE` (arquivo privado montado no host/container).
Variáveis separadas como `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e
`FIREBASE_PRIVATE_KEY` **não fazem parte do contrato runtime atual**.

### Configuração Firebase dos apps móveis

Passenger e Driver inicializam Firebase a partir de `--dart-define`. O gate
final `.github/workflows/mobile-build-audit.yml` recusa release com Push
desativado.

Secrets compartilhados obrigatórios:

- `RAMO_FIREBASE_MESSAGING_SENDER_ID`;
- `RAMO_FIREBASE_PROJECT_ID`.

`RAMO_FIREBASE_STORAGE_BUCKET` é opcional para o Push atual.

Para API key e App ID, prefira os Secrets específicos por app/plataforma:

- Android Passenger: `RAMO_FIREBASE_ANDROID_PASSENGER_API_KEY` e
  `RAMO_FIREBASE_ANDROID_PASSENGER_APP_ID`;
- Android Driver: `RAMO_FIREBASE_ANDROID_DRIVER_API_KEY` e
  `RAMO_FIREBASE_ANDROID_DRIVER_APP_ID`;
- iOS Passenger: `RAMO_FIREBASE_IOS_PASSENGER_API_KEY` e
  `RAMO_FIREBASE_IOS_PASSENGER_APP_ID`;
- iOS Driver: `RAMO_FIREBASE_IOS_DRIVER_API_KEY` e
  `RAMO_FIREBASE_IOS_DRIVER_APP_ID`.

Os workflows mantêm fallbacks genéricos (`RAMO_FIREBASE_API_KEY`,
`RAMO_FIREBASE_APP_ID`, `RAMO_FIREBASE_PASSENGER_APP_ID` e
`RAMO_FIREBASE_DRIVER_APP_ID`) apenas para compatibilidade. Como cada app
Firebase possui App ID próprio, a configuração específica por plataforma/app é
a opção recomendada para produção.

Os workflows de Preview e iOS Payment Audit permitem compilação sem esses
Secrets e emitem warning; nesses binários o Push fica desativado. O
`Mobile Build Audit` final exige a configuração completa.



## Google Maps Platform

O Core usa **Google Routes API** e **Google Places API (New)**. Os apps móveis
não recebem a chave de servidor; eles chamam os endpoints do próprio Core.

Produção:

```bash
ROUTING_PROVIDER=google
ROUTING_TIMEOUT_MS=5000
GOOGLE_MAPS_SERVER_API_KEY=<secret>
GOOGLE_ROUTES_BASE_URL=https://routes.googleapis.com/
GOOGLE_PLACES_BASE_URL=https://places.googleapis.com/v1/
```

Em `NODE_ENV=production`, o Core não inicia sem
`GOOGLE_MAPS_SERVER_API_KEY` válida. Restrinja essa credencial no Google Cloud
às APIs de Routes e Places usadas pelo servidor e mantenha billing, quotas e
alertas de consumo habilitados.

As chaves dos mapas visuais Android/iOS são separadas da chave de servidor e
devem ser restritas pelos respectivos package/bundle IDs e credenciais de
assinatura.


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

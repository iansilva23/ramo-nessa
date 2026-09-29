# Firebase / FCM / APNs — produção

Este documento define o fechamento do Push do Ramo Nessa. O código de registro, renovação, invalidação de token e envio FCM já existe no Core, Passenger e Driver.

## Projeto Firebase

Usar um único projeto Firebase de produção para o ecossistema Ramo Nessa.

Registrar quatro apps dentro desse mesmo projeto:

- Android Passenger: `br.com.ramonessa.passenger`;
- Android Driver: `br.com.ramonessa.driver`;
- iOS Passenger: `br.com.ramonessa.passenger`;
- iOS Driver: `br.com.ramonessa.driver`.

Os quatro App IDs devem pertencer ao mesmo Messaging Sender ID e Project ID.

## Core / servidor

O perfil `deploy/prod` exige:

- `PUSH_PROVIDER=fcm`;
- Service Account Firebase em arquivo JSON privado;
- `FIREBASE_SERVICE_ACCOUNT_HOST_FILE=./secrets/firebase-service-account.json` no host;
- montagem somente-leitura no Core em `/run/secrets/ramo-nessa-firebase.json`.

A Service Account não deve ser colocada no Git, imagem Docker, PostgreSQL, Admin, Passenger ou Driver.

`deploy/prod/validate-env.mjs` valida o arquivo real antes do deploy:

- o caminho precisa apontar para arquivo JSON;
- o arquivo deve estar com permissão `0600` ou mais restritiva;
- `type` precisa ser `service_account`;
- `project_id`, `client_email` e `private_key` precisam existir;
- a chave privada precisa ter o formato PEM esperado.

## Builds móveis

O gate final `Mobile Build Audit` exige configuração Firebase para cada superfície.

Secrets compartilhados:

- `RAMO_FIREBASE_MESSAGING_SENDER_ID`;
- `RAMO_FIREBASE_PROJECT_ID`;
- `RAMO_FIREBASE_STORAGE_BUCKET` é opcional para o Push atual.

App IDs específicos obrigatórios:

- `RAMO_FIREBASE_ANDROID_PASSENGER_APP_ID`;
- `RAMO_FIREBASE_ANDROID_DRIVER_APP_ID`;
- `RAMO_FIREBASE_IOS_PASSENGER_APP_ID`;
- `RAMO_FIREBASE_IOS_DRIVER_APP_ID`.

API keys específicas são preferidas:

- `RAMO_FIREBASE_ANDROID_PASSENGER_API_KEY`;
- `RAMO_FIREBASE_ANDROID_DRIVER_API_KEY`;
- `RAMO_FIREBASE_IOS_PASSENGER_API_KEY`;
- `RAMO_FIREBASE_IOS_DRIVER_API_KEY`.

O validador rejeita App ID de plataforma errada e App ID cujo sender não corresponda ao `RAMO_FIREBASE_MESSAGING_SENDER_ID`.

## iOS / APNs

Os dois projetos iOS já possuem:

- `aps-environment=production` no Release;
- `aps-environment=development` em Debug/Profile;
- `remote-notification` em `UIBackgroundModes`;
- referência de Release para `Runner/Release.entitlements`.

O Preflight valida esses itens para impedir regressão.

Para entrega real no iPhone ainda é necessário:

1. ter Apple Developer Team ativo;
2. habilitar Push Notifications para os dois App IDs;
3. criar/configurar uma chave APNs adequada na conta Apple;
4. associar essa chave APNs ao projeto Firebase correto;
5. gerar provisioning/signing de distribuição;
6. validar FCM em aparelho físico.

## Registro e ciclo de sessão

Passenger e Driver iniciam o registro FCM quando a sessão autenticada fica pronta e param o serviço no logout/encerramento da sessão.

O token FCM é enviado ao Core com:

- plataforma Android/iOS;
- provider `fcm`;
- versão do app;
- build number.

Renovações de token são registradas automaticamente. Tokens que o FCM informar como `UNREGISTERED` são desativados no Core.

## Comportamento operacional

Push é best-effort e nunca deve bloquear transição de corrida, matching, pagamento ou logout. Realtime continua sendo o canal principal quando o app está conectado.

O Core envia payload com `notification` + `data`, permitindo notificação do sistema em background e roteamento pelo tipo de evento.

## Homologação física obrigatória

Antes do lançamento, testar em pelo menos um Android e um iPhone reais:

- login e registro inicial do token;
- app aberto;
- app em background;
- app fechado pelo usuário e reaberto;
- renovação do token;
- logout desativando o device da sessão;
- oferta de corrida para Motorista;
- atualização/cancelamento/reembolso para Passageiro;
- notificação administrativa;
- token invalidado/removido;
- troca de rede Wi-Fi/4G/5G;
- iPhone com APNs de produção via Firebase.

## Estado

O lado do código/repositório está preparado. A prontidão comercial deste passo ainda depende das credenciais reais do Firebase, configuração APNs/Apple Developer, Secrets de build e homologação em aparelhos físicos.

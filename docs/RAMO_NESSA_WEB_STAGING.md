# Ramo Nessa Web/PWA — preparação de homologação (SEM DEPLOY)

Branch: `feature/flutter-web-permissions-20261013` / PR #6 DRAFT.
Os dois apps compartilham as telas Flutter com Android/iOS, mas são builds
independentes que precisam de homologação no Safari do iPhone.

## URLs previstas (ainda NÃO ativas)

- `https://<APP_DOMAIN>/passageiro/`
- `https://<APP_DOMAIN>/motorista/`
- ADM existente: `https://<APP_DOMAIN>/admin/`
- Core HTTPS/WebSocket: `https://<APP_DOMAIN>/v1/`

O domínio é o mesmo para evitar CORS e impedir que tokens Bearer sejam enviados
a domínios terceiros. `RamoCoreConfig` e `DriverCoreConfig` obrigam origem
idêntica à da página quando `kIsWeb`. No Android/iOS o comportamento anterior
não é alterado.

## Isolamento da infraestrutura

`deploy/staging/Caddyfile` reserva /passageiro e /motorista; o proxy /v1 e
o ADM não mudam de endereço. A política de GPS é liberada APENAS nas rotas
Web. Bundle estático em `deploy/staging/web-dist/{passenger,driver}` é montado
somente leitura em `/srv/web`. Nenhum segredo, chave privada, volume PostgreSQL
ou documento de motorista é exposto por essa montagem.

Não aplique `docker compose up`, reinício ou atualização sem autorização,
backup verificado e inspeção do commit/estado real do VPS.

## Preparação dos builds no CI

```bash
python3 -m pip install Pillow==11.3.0
python3 scripts/web/generate_pwa_icons.py
# Exemplo: chave de navegador restringida por HTTP referrer e Maps JS API
# no Google Cloud; jamais reutilizar chave do Core ou Android.
# O CI deve obter a chave de RAMO_GOOGLE_MAPS_WEB_API_KEY (GitHub Secret).
flutter build web --release --base-href=/passageiro/ \
  --dart-define=RAMO_PREVIEW_MODE=false
flutter build web --release --base-href=/motorista/ \
  --dart-define=RAMO_PREVIEW_MODE=false
```

Cada comando acima deve ser executado no diretório do respectivo app
(`apps/passenger` ou `apps/driver`) após injetar a chave Web no index.html.
O workflow automatizado já realiza estes passos e publica artefatos de **revisão**.

Se `RAMO_GOOGLE_MAPS_WEB_API_KEY` não estiver configurada no GitHub, o CI
usa `WEB_KEY_NOT_CONFIGURED_FOR_CI` apenas para validar compilação. Tais
artefatos NÃO são publicáveis. `scripts/web/verify_web_bundle.mjs` recusa
esse marcador fora do modo `--ci-review`.

### Verificação obrigatória, antes de qualquer publicação

```bash
node scripts/web/verify_web_bundle.mjs --role=passenger \
  --dist=/caminho/seguro/para/build/passageiro
node scripts/web/verify_web_bundle.mjs --role=driver \
  --dist=/caminho/seguro/para/build/motorista
```

Esses checks conferem HTML, base href, JS Flutter, manifesto PWA, dimensões
reais dos ícones 192/512 e chave Maps sem placeholder. A existência do bundle
não prova comportamento de login, pagamentos ou navegação.

## Pendências para homologação

1. Validar Google Maps JavaScript API com chave pública restrita ao(s)
   hostname(s) do ambiente e à API habilitada; bloquear preview fake key.
2. Validar permissões de GPS, precisão, geolocator e mapa em Safari real.
   Conferir que o header `Permissions-Policy` recebido permite GPS nas PWAs
   e continua bloqueando no ADM.
3. Validar primeira sessão/login, cancelamento e retomada, OTP real, perfil.
4. Validar motorista no Safari com tela ativa; ao bloquear/minimizar, a Web
   perde garantia de GPS/WebSocket/timers. Não liberar oferta real até validar
   expiração de localização no Core e reconexão.
5. Homologar transporte WebSocket por ticket efêmero e de uso único no Safari,
   incluindo reconexão, troca de abas e logout. Polling HTTP segue como fallback;
   detalhes e limites da implementação constam na continuação abaixo.
6. Cartão requer MercadoPago.js sem colocar dados sensíveis no Core. Esta
   etapa mantém o canal nativo e **não** certifica cartão na Web.
7. Web Push exige Service Worker, permissão e PWA instalada no iPhone. Botão
   aparece como "Em breve" enquanto a integração não está homologada.
8. Validar políticas de CSP no Safari e Android; o gateway não substitui
   testes reais. Validar cache, atualização de PWA e ícones.
9. Rodar regressões nativas Android/iOS e testes ponta a ponta, incluir captura
   de evidências. Fazer backup/rollback documentado antes de ativar URL.

## Regras de segurança

- Não `git reset --hard`, `docker compose down -v`, `docker volume rm`,
  `pg_restore` ou merge em main.
- Não publicar saída de `docker inspect`/`docker compose config` com segredos.
- A mudança atual prepara arquivos somente, não registra domínio novo,
  não altera o VPS e não ativa pagamentos ou ofertas de motorista na Web.

## Segurança do Motorista Web e CanvasKit

No navegador do iPhone, o GPS, a conexão e os temporizadores podem ser
suspensos quando a página fica oculta. O Motorista Web tenta desativar sua
disponibilidade ao ir para segundo plano e repete a verificação ao retornar.
Ele nunca tenta desligar uma viagem já ativa por causa desse evento; nesse
caso mostra um aviso para conferir a corrida. Não é garantia de envio de rede
antes da suspensão; o Core já exclui localizações antigas depois do TTL
operacional (120 segundos por padrão). Portanto, ainda NÃO há autorização
para liberar motoristas Web em produção sem teste real de visibilidade,
localização e reconexão no Safari.

As rotas /passageiro/ e /motorista/ permitem exclusivamente o mínimo
adicional necessário para o CanvasKit Flutter: script da CDN gstatic e
`'wasm-unsafe-eval'`. O ADM continua com CSP restrita; o navegador não
recebe segredos de backend e o GPS segue limitado às PWAs. O workflow
verifica esses cabeçalhos e valida a sintaxe do Caddy sem instalar no VPS.

## Continuação RAMONESSA-WEB-PR6-131026 — autenticação de tempo real

Estado remoto conferido antes de editar: `2b33b6d6703656dec84c8304a48d2e9c8ab6bff6`,
workflow `38424373415` verde. As etapas aprovadas de permissões, same-origin,
mapas, bundles e segurança de disponibilidade foram preservadas.

As PWAs agora usam um transporte compartilhado (`packages/ramo_realtime`):

1. `POST /v1/realtime/ticket` via HTTPS na mesma origem, com Bearer no cabeçalho.
2. Core valida sessão, papel, aprovação do motorista ou propriedade da corrida.
3. Emite ticket aleatório válido por até 15 segundos, limitado à sessão,
   origem, papel e corrida. Armazena só o hash e permite no máximo quatro
   tickets pendentes por sessão e 5.000 no processo.
4. Upgrade WebSocket oferece `ramo.realtime.v1` e `ticket.<ticket>` em
   `Sec-WebSocket-Protocol`. O servidor retorna apenas `ramo.realtime.v1`.
   Nem o Bearer nem o ticket aparecem na URL. Cabeçalhos de protocolo e
   corpos de emissão não devem ser registrados em logs.
5. Antes do upgrade, Core consome o ticket uma única vez e verifica novamente
   revogação, expiração e suspensão. O cliente recebe bootstrap e os mesmos
   eventos já usados pelos apps nativos, com polling HTTP preservado.
6. Em perda de conexão, solicita outro ticket e reconecta com espera progressiva.
   Cancelar a assinatura fecha o socket e os temporizadores. HTTP 401/403 ou
   fechamento 4401 encerram a assinatura; o gate de sessão continua responsável
   pelo login. Logout fecha imediatamente sockets Web da sessão. Revogações
   externas/suspensões são verificadas no heartbeat de 30 segundos.

Os sockets nativos continuam usando Authorization no upgrade. A CSP das
PWAs permite explicitamente `wss://{$APP_DOMAIN}`; o ADM permanece restrito.
São mudanças de código/configuração preparada, sem aplicação na VPS.

As chaves de token e identificação de dispositivo no navegador agora incluem
`passenger` ou `driver`, evitando que dois apps na mesma origem sobrescrevam
as sessões. Chaves nativas permanecem iguais. A chave Web antiga, ambígua,
não é migrada: uma sessão de revisão antiga precisará entrar novamente.
`flutter_secure_storage` Web continua sendo armazenamento acessível ao
JavaScript da origem, e não equivale a cookie HttpOnly ou proteção contra XSS.
A sessão só é autorizada pelo Core; esta etapa não encerra a auditoria de
armazenamento, dependências carregadas e endurecimento de CSP.

Os tickets são locais ao processo do Core. Reiniciar não requer migração:
clientes obtêm outro ticket. Antes de escalar para múltiplas réplicas, será
necessário um armazenamento de tickets compartilhado com consumo atômico.

### Evidências e limites

- Testes novos cobrem tickets, origem, expiração, replay, revogação, isolamento
  entre papéis/corridas, limite de payload, conexão HTTP/WebSocket real, eventos
  privados, TTL original de oferta de 35s e compatibilidade do upgrade nativo.
- Testes do transporte Dart cobrem mesma origem, falha de sessão, cancelamento
  durante emissão, JSON inválido e reconexão com novo ticket.
- O workflow Web passa a analisar/testar o pacote compartilhado e também
  executar typecheck, regressões e build do Core. Bundles seguem para revisão.
- Socket automatizado não representa Safari real, bloqueio de tela ou GPS.
  Ainda faltam login WhatsApp real, Maps com chave autorizada, cartão Web,
  Web Push, preferências reais de notificações e homologação iPhone/Android.
- Nenhum teste nesta etapa solicita OTP real, realiza cobrança, muda preços,
  aplica migrações na VPS ou publica as PWAs.

Verificação local em 13/10/2026: typecheck e build do Core aprovados;
705 testes descobertos, 657 aprovados, zero falhas e 48 ignorados por dependerem
de PostgreSQL/configuração externa. Oito cenários novos de ticket e socket
passaram, incluindo HTTP/WebSocket reais em loopback. As verificações Flutter
ficam sob o workflow do PR; homologação real permanece pendente.


## Cartão Web — continuação do PR #6

Base remota conferida antes de editar: c9352583; workflow 38429760465 verde.
O checkout Flutter existente continua separando adicionar/salvar cartão e
confirmar pagamento. A nova fábrica escolhe o transportador Web somente no
navegador, mantendo o MethodChannel Android/iOS.

Na Web, uma tela Flutter no tema Ramo Nessa hospeda Secure Fields do
MercadoPago.js. Número, validade e CVV ficam em iframes do provedor. A ponte
não lê esses valores e retorna exclusivamente token, método/tipo, últimos
quatro dígitos e um segundo token opcional, distinto, para salvar cartão.
Nome/CPF do titular são enviados diretamente ao SDK, sem inclusão no pedido
para o Core. Cartão salvo pede somente CVV e emite um token novo para cardId.

A chave pública já disponibilizada na política de pagamentos é reutilizada;
nenhuma chave financeira, modo, saldo ou regra foi alterada. O SDK remoto só
é solicitado ao abrir a entrada de cartão. A ponte é entregue como arquivo
local do Passageiro, e os bundles verificam sua presença. Motorista e ADM
não carregam essa ponte nem recebem permissões CSP de pagamento.

A tela e a ponte encerram os campos ao cancelar, navegar para trás ou expirar
a reserva; respostas atrasadas não confirmam pagamento. Consulta de BIN usa
controle de geração para não substituir o cartão atual com resposta antiga.
A validação do provedor aceita somente suporte a pagamento à vista; o Core
mantém installments=1, idempotência e confirmação reconciliada/webhook.
O Core também recusa campos adicionais no pedido de cartão, incluindo PCI,
sem incluir conteúdo sensível no erro. Nenhuma cobrança nasce na tokenização.

Testes da ponte executam Chromium com SDK simulado e toda saída para serviços
externos bloqueada. Eles verificam a fronteira dos dados, tokens separados,
cartão salvo, cancelamento, falhas, validade e concorrência. Isso NÃO valida
um cartão real no Mercado Pago, 3DS real ou Safari de iPhone. Homologação com
credenciais de teste, CSP/antifraude reais, Pix/carteira/estornos e dispositivos
continua pendente. Nenhum teste dispara uma transação ou OTP real.

Referências primárias:
- https://github.com/mercadopago/sdk-js/blob/main/docs/fields.md
- https://github.com/mercadopago/sdk-js/blob/main/docs/core-methods.md
- https://www.mercadopago.com.br/developers/pt/docs/sdks-library/overview

## Web Push e preferência de avisos — continuação do PR #6

O cadastro `/v1/notifications/device` agora aceita `platform: web` somente com
FCM. Os novos clientes enviam `notificationPreference: important|all`, a partir
da mesma escolha local já existente. `important` mantém avisos operacionais de
corrida, pagamento, manutenção e atualização, mas bloqueia `marketing.*` e
broadcasts `promotion`, `event` e `general`. Escolher `all` não substitui os
consentimentos de privacidade que o Growth já verifica. Clientes/registrados
anteriores preservam o comportamento quando não enviam a nova preferência.
A tela Notificações dos dois apps permite alterar e sincronizar a escolha e
mostra quando a sincronização está pendente. O onboarding também informa
pendências e mantém acesso ao app. Ativação e salvamento possuem prazos
limitados na interface, para que uma resposta ausente do provedor não prenda
o usuário. Uma falha de cadastro não é rotulada como permissão negada. O onboarding aprovado mantém seu
layout; usuários que já o concluíram podem configurar push pelo perfil.

`packages/ramo_push` contém o bridge Dart e o código JavaScript compartilhado.
As cópias entregues nos dois diretórios `web/` são verificadas por teste.
O bridge carrega Firebase JS 13.0.0 após consentimento, chama `getToken` com
VAPID público e registro de worker explícito. Os workers de push usam
`/passageiro/push-scope/` e `/motorista/push-scope/`, sem substituir o worker
Flutter. Neste bridge, o Bearer é mantido apenas em memória e no cabeçalho HTTP da
mesma origem; ele não adiciona cópias ao worker, à URL ou ao armazenamento.
O armazenamento/restauração de sessão Flutter original permanece em uso e
continua sujeito à auditoria Web/XSS já descrita acima.
O armazenamento local guarda um identificador aleatório de posse por app
e seu appId Firebase público; Web Locks serializa mudanças entre abas. Trocar conta/aba rotaciona a
assinatura anterior; logout em uma aba antiga não apaga o push da aba atual.
A aba ativa mais recente é responsável pelo registro de avisos do mesmo app.

O sucesso só é apresentado após permissão concedida e resposta válida do Core.
Login/restauração nunca solicita permissão automaticamente. O prompt explícito
é iniciado no toque do usuário, antes de imports/awaits. No iPhone/iPad, orientar
instalação na Tela de Início e abertura pelo ícone; iOS/iPadOS 16.4 ou posterior
é o requisito inicial. Bloqueio de permissão exige ajuste nas configurações.
Web Push é opcional: falhas não bloqueiam login, perfil ou corrida.
Isso não muda a limitação de GPS/suspensão em segundo plano do Motorista Web.

### Preparação futura, sem publicar nem alterar a VPS neste PR

Antes de um build para homologação real, preparar cada app:

```sh
node scripts/web/prepare_web_push.mjs --role=passenger
node scripts/web/prepare_web_push.mjs --role=driver
```

O comando lê apenas cinco configurações **públicas** do ambiente:
`RAMO_FIREBASE_WEB_API_KEY`, `RAMO_FIREBASE_WEB_APP_ID` (appId Web, não Android/iOS),
`RAMO_FIREBASE_WEB_PROJECT_ID`, `RAMO_FIREBASE_WEB_MESSAGING_SENDER_ID` e
`RAMO_FIREBASE_WEB_VAPID_KEY`. Usar registros Firebase Web próprios para cada
app, com appIds distintos, e repetir o comando com a configuração correspondente.
O preparador e o bridge bloqueiam a configuração repetida: o SDK Firebase usa
appId como chave do token no IndexedDB, independentemente do nome do app. Não usar service
account nem chave VAPID privada no browser. Sem esses valores, o bundle de
revisão mantém `ramoPushConfig = null` e mostra push não configurado. A CI não
usa credenciais reais de push nem cobra provedores.

A migration `085_web_push_preferences.sql` está apenas preparada no repositório.
Ela preserva registros anteriores, aceita Web/FCM e adiciona a preferência.
É testada duas vezes em PostgreSQL descartável no Actions para verificar
idempotência. Não aplicar em homologação/produção sem autorização específica.
Consultas PostgreSQL de envio agora excluem sessões revogadas/expiradas e
validam o dono do dispositivo. `DELETE /v1/notifications/device` desativa somente
os dispositivos da sessão autenticada, sem revogar a sessão ou outros aparelhos.
O logout existente continua desativando dispositivos da sessão no Core.
Quando o bootstrap confirma uma sessão inválida/expirada, também encerra o push
local sem bloquear o login; falha temporária de rede preserva a sessão existente.
A restauração de push descarta leituras atrasadas após logout ou outra ativação.

O FCM Web envia data-only; worker/primeiro plano exibem uma notificação de texto,
com ícone local e clique no próprio aplicativo. URLs/ações externas do payload
são ignoradas, sem aceite automático de corrida. Ofertas usam TTL de 35 segundos;
outros avisos, 60. A validade real da oferta permanece determinada pelo Core,
sem estender o prazo. Push é best-effort: mensagens já enfileiradas no provedor
podem chegar durante uma mudança de sessão, e entrega/latência não são garantidas.
A interface revalida sessão/estado da corrida; push não substitui WebSocket/polling.

### Evidências e limites

Testes automatizados cobrem consentimento por toque, falhas de configuração e
Core, instruções do iPhone, preferências, logout durante tokenização, troca de
conta/abas, isolamento dos apps/workers e clique seguro. Chromium usa SDK Firebase
simulado; há também registro real de workers locais, sem assinatura FCM real.
O teste PostgreSQL usa schema e banco descartáveis, sem acesso à VPS.
Ainda falta configurar Firebase Web/VAPID no ambiente de homologação autorizado
e verificar recebimento real em iPhone/Safari, Chrome/Android, tela bloqueada,
permissão revogada, rede indisponível e logout. Regressões em aparelhos Android/iOS
reais continuam pendentes; análise/testes Flutter não substituem essa homologação.

Referências primárias usadas:
- https://firebase.google.com/docs/cloud-messaging/web/receive-messages
- https://firebase.google.com/docs/cloud-messaging/web/get-started
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

- Código primário da chave de armazenamento FCM: https://github.com/firebase/firebase-js-sdk/blob/main/packages/messaging/src/internals/idb-manager.ts

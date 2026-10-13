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

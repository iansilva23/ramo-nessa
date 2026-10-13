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
5. O navegador não pode definir Authorization no upgrade WebSocket. Nesta etapa
   o app usa fallback HTTP autenticado. Planejar ticket efêmero e de uso único
   na mesma origem para futura atualização em tempo real.
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

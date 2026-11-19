# Google Maps Platform — produção

Este documento define o contrato de chaves do Ramo Nessa. Nenhuma chave real deve ser versionada.

## APIs usadas

- Maps SDK for Android: renderização do mapa nos dois apps Android;
- Maps SDK for iOS: renderização do mapa nos dois apps iOS;
- Places API (New): somente pelo Core para autocomplete, busca e detalhes;
- Routes API: somente pelo Core para rota, distância, ETA e matching por distância roteada.

Os apps móveis não chamam Places API (New) nem Routes API diretamente.

## Chaves de produção

| Superfície | Secret/runtime | Restrição de aplicativo | Restrição de API |
| --- | --- | --- | --- |
| Passenger Android | RAMO_GOOGLE_MAPS_ANDROID_PASSENGER_API_KEY | Android app: br.com.ramonessa.passenger + SHA-1 do certificado de produção/Play App Signing | Maps SDK for Android |
| Driver Android | RAMO_GOOGLE_MAPS_ANDROID_DRIVER_API_KEY | Android app: br.com.ramonessa.driver + SHA-1 do certificado de produção/Play App Signing | Maps SDK for Android |
| Passenger iOS | RAMO_GOOGLE_MAPS_IOS_PASSENGER_API_KEY | iOS app: br.com.ramonessa.passenger | Maps SDK for iOS |
| Driver iOS | RAMO_GOOGLE_MAPS_IOS_DRIVER_API_KEY | iOS app: br.com.ramonessa.driver | Maps SDK for iOS |
| Core | GOOGLE_MAPS_SERVER_API_KEY | IP address: IP público de saída do VPS de produção | Places API (New) e Routes API |

Cada chave móvel de produção deve ser própria do app. O Mobile Build Audit não aceita mais a chave genérica como fallback de release.

## Dependência de assinatura Android

A restrição Android usa package name + SHA-1 do certificado de assinatura. A chave de produção só deve ser considerada pronta quando o certificado que assinará o app distribuído estiver definido.

- se o app for distribuído pelo Google Play com Play App Signing, registrar o SHA-1 do App signing key certificate;
- para APK distribuído fora do Play, registrar o SHA-1 do certificado de produção usado naquele APK;
- nunca usar o keystore público de Preview como identidade de produção.

Enquanto essa identidade não estiver fechada, não liberar uma chave Android irrestrita apenas para fazer o build passar.

## Servidor

A chave GOOGLE_MAPS_SERVER_API_KEY fica somente no ambiente protegido do Core.

Aplicar:

- application restriction por IP público de saída do servidor;
- API restriction somente para Places API (New) e Routes API;
- nunca enviar essa chave ao Passenger, Driver, Admin ou logs;
- manter GOOGLE_PLACES_BASE_URL e GOOGLE_ROUTES_BASE_URL nos endpoints oficiais HTTPS em produção.

Se o IP público do servidor mudar, atualizar a restrição antes da troca de tráfego.

## Projeto Google Cloud

Antes da homologação física:

1. associar o projeto Google Cloud a uma conta de faturamento;
2. habilitar Maps SDK for Android, Maps SDK for iOS, Places API (New) e Routes API;
3. criar as cinco chaves de produção acima;
4. aplicar as restrições de aplicativo e API antes de usar cada chave;
5. configurar budgets/alertas de faturamento e quotas compatíveis com o piloto;
6. guardar as chaves móveis nos GitHub Actions secrets específicos e a chave de servidor somente no ambiente do Core/VPS.

## Gates do repositório

- deploy/prod/validate-env.mjs recusa GOOGLE_MAPS_SERVER_API_KEY ausente/placeholder;
- tooling/validate-google-maps-key.mjs recusa chave móvel ausente, placeholder, curta, com whitespace ou caracteres de controle;
- Mobile Build Audit exige chaves específicas para Passenger/Driver Android e iOS;
- Preview pode continuar usando configuração de Preview e não certifica restrições de produção.

Esses gates comprovam configuração local do build, não conseguem consultar ou certificar as restrições configuradas na conta Google Cloud.

## Homologação antes do lançamento

Em aparelhos físicos:

- abrir mapa no Passenger e Driver;
- confirmar GPS atual e movimentação do motorista;
- testar autocomplete e Place Details;
- calcular rota/ETA;
- testar localidade local assinada via placeProof;
- testar um destino externo aprovado;
- confirmar que uma chave deliberadamente usada fora da superfície autorizada é rejeitada;
- verificar métricas de erro, latência e consumo no Google Cloud.

## Estado

A integração em código está pronta. O fechamento comercial deste passo depende de credenciais reais, billing/quotas no Google Cloud, IP público do VPS e identidade final de assinatura Android.

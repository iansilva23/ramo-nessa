# Mapas e localização — Ramo Nessa

## Estado atual

O Ramo Nessa usa uma camada própria para localização, busca e rotas:

- `LocationService`
- `PlaceSearchService`
- `RouteService`

Os apps não acessam Routes ou Places diretamente. O Passenger e o Driver falam com o Ramo Nessa Core, e o Core usa Google Maps Platform no servidor. O mapa visual é renderizado com `google_maps_flutter`.

## Stack atual

- mapa Android/iOS: Google Maps SDK via `google_maps_flutter`;
- GPS: `geolocator`;
- busca de lugares: Google Places API (New) via Core;
- rota, distância, ETA e geometria: Google Routes API via Core;
- matching por distância roteada: Google Routes API via Core;
- Preview sem `RAMO_PREVIEW_CORE_BASE_URL`: catálogo/rotas locais claramente
  demonstrativos;
- Preview com `RAMO_PREVIEW_CORE_BASE_URL` HTTPS: Passageiro usa Places/Routes
  e Motorista usa Routes via Core de teste, sem expor a chave de servidor;
- Test Stack: mock local compatível com os contratos de Routes/Places, sem consumo externo;
- Place Details e a busca manual podem devolver `approvedPricingZoneId`, `approvedPricingLocalityId` e `placeProof` quando o Core reconhece uma localidade presente no catálogo vigente;
- a `placeProof` é assinada pelo Core e vinculada ao Place ID, localidade e coordenadas; na preparação da corrida ela é verificada antes de confiar na localidade específica;
- sem prova aprovada (por exemplo GPS puro), permanece o fallback de validação por zona/raio.

## Segurança das chaves

As credenciais de produção são separadas por app/superfície:

- Passenger Android: `RAMO_GOOGLE_MAPS_ANDROID_PASSENGER_API_KEY`;
- Driver Android: `RAMO_GOOGLE_MAPS_ANDROID_DRIVER_API_KEY`;
- Passenger iOS: `RAMO_GOOGLE_MAPS_IOS_PASSENGER_API_KEY`;
- Driver iOS: `RAMO_GOOGLE_MAPS_IOS_DRIVER_API_KEY`;
- servidor: `GOOGLE_MAPS_SERVER_API_KEY`, usada somente pelo Core para Routes/Places.

A matriz de restrições e homologação está em `docs/GOOGLE_MAPS_PRODUCTION.md`.

A chave de servidor não deve ser embutida nos apps móveis. Chaves locais de iOS ficam em `GoogleMaps.local.xcconfig`, ignorado pelo Git.

## Produção

Antes do lançamento comercial:

- criar as quatro chaves móveis dedicadas e a chave do servidor;
- aplicar restrições por package + SHA-1, bundle ID, IP público e APIs permitidas;
- habilitar billing e definir budgets/alertas/quotas no projeto Google Cloud;
- validar Maps SDK, Routes API e Places API em aparelhos físicos;
- acompanhar erros, latência, consumo e custos das APIs.

## Privacidade

O Passageiro solicita localização em primeiro plano. O Motorista usa localização enquanto online e possui configuração específica para operação em segundo plano.

## Próximos pontos

- favoritos e locais salvos;
- ampliar a cobertura geoespacial para GPS puro e pontos que não tenham uma localidade aprovada pelo Core;
- telemetria e monitoramento de falhas/custos;
- testes físicos de GPS, rota e tracking em condições reais de rede.

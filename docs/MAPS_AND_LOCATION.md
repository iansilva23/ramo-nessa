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
- Preview: serviços locais/fakes, sem chamadas Google;
- Test Stack: mock local compatível com os contratos de Routes/Places, sem consumo externo.

## Segurança das chaves

As credenciais são separadas por superfície:

- Android: `RAMO_GOOGLE_MAPS_ANDROID_API_KEY`, restrita ao app Android;
- iOS: `RAMO_GOOGLE_MAPS_IOS_API_KEY`, restrita ao app iOS;
- servidor: `GOOGLE_MAPS_SERVER_API_KEY`, usada somente pelo Core para Routes/Places.

A chave de servidor não deve ser embutida nos apps móveis. Chaves locais de iOS ficam em `GoogleMaps.local.xcconfig`, ignorado pelo Git.

## Produção

Antes do lançamento comercial:

- criar chaves de produção separadas para Android, iOS e servidor;
- aplicar restrições por package/SHA, bundle ID e APIs permitidas;
- habilitar billing e definir alertas/quotas no projeto Google Cloud;
- validar Maps SDK, Routes API e Places API em aparelhos físicos;
- acompanhar erros, latência, consumo e custos das APIs.

## Privacidade

O Passageiro solicita localização em primeiro plano. O Motorista usa localização enquanto online e possui configuração específica para operação em segundo plano.

## Próximos pontos

- favoritos e locais salvos;
- melhorias de geofencing das áreas atendidas;
- telemetria e monitoramento de falhas/custos;
- testes físicos de GPS, rota e tracking em condições reais de rede.

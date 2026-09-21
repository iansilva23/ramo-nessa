# Mapas e localização — Ramo Nessa

## Estado atual

O app Passageiro usa uma camada de abstração para localização, busca e rotas:

- LocationService
- PlaceSearchService
- RouteService

A interface não conhece diretamente o provedor. Isso permite trocar os serviços sem redesenhar o aplicativo.

## Desenvolvimento

Nesta etapa:

- mapa: flutter_map + OpenStreetMap;
- GPS: geolocator;
- busca de lugares: Nominatim público;
- rota, distância e ETA: OSRM público.

A atribuição do OpenStreetMap permanece visível no mapa.

## Produção

Os endpoints públicos de OpenStreetMap, Nominatim e OSRM são adequados somente para desenvolvimento e validação de baixo volume. Antes do lançamento comercial, o Ramo Nessa deverá usar um provedor com capacidade e SLA adequados ou infraestrutura própria.

A busca não consulta o Nominatim a cada tecla. A tela usa debounce superior a um segundo.

## Privacidade

O Passageiro solicita apenas localização em primeiro plano. Localização em background será tratada separadamente no app Motorista quando houver justificativa funcional e configurações nativas específicas.

## Próximos pontos

- preço real;
- seleção de origem manual;
- favoritos;
- geofencing das áreas atendidas;
- provedor definitivo de mapas e rotas;
- telemetria e monitoramento de falhas.

# Ramo Nessa — GeoDB (primeira entrega, sem deploy)

## Objetivo
Reduzir chamadas faturáveis mantendo os aplicativos Flutter e Google Maps SDK.
A primeira fase introduz uma base **independente** de destinos, com importação
administrativa manual, prévia, deduplicação e busca local antes de Places.

## Fontes e política
O catálogo aceita somente `osm`, `overture` e `manual`. Não importar
respostas Google Places, Routes ou Geocoding nesta base. ODS/OSM exigem
verificação de licença e atribuições. Conservar metadados de origem no cadastro.

## Modo de uso (após homologação)
1. Executar a migration `082_geo_catalog.sql`.
2. Montar lotes com até 200 registros: `{source,sourceId,name,address,category,city,latitude,longitude}`.
3. Utilizar `POST /v1/admin/geo/places/preview` com `{places:[...]}`;
   revisar novos, modificados e iguais. Exige `pricing:read`.
4. Confirmar manualmente por `POST /v1/admin/geo/places/import`; exige
   `pricing:write`. Repita lotes sem criar duplicatas.
5. Habilitar `GEO_CATALOG_SEARCH_ENABLED=true` **somente após testes**.
6. Os endpoints `/v1/maps/places/autocomplete`, `/search` e `/details`
   podem responder pela base local primeiro. O Core mantém a validação da
   localidade aprovada e `placeProof` conforme fluxo de preço existente.
7. Google permanece como fallback para destinos não cobertos.

## Restrições deliberadas
- Nenhum job é automático; sem coleta do Google ou scraping.
- Rotas Google e ETA seguem integradas e inalteradas neste bloco.
- O banco geográfico não habilita áreas de corrida nem modifica preços.
- Não existem métricas de economia real até instrumentar consumo faturável e
  medir chamadas por serviço. Importar uma base não garante cobertura completa.
- O código fica inativo por padrão. Testar Android, iOS, descontos e
  assinatura de lugares antes de habilitar em homologação/produção.

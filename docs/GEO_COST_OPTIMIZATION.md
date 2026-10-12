# Ramo Nessa — GeoDB e GeoAgent (branch de homologação)

## Estado do trabalho
- **Sem implantação no VPS, sem merge e sem alteração dos aplicativos Flutter.**
- O Google Maps SDK continua sendo o mapa visual de Android e iOS.
- A busca GeoDB-first fica **DESLIGADA** por padrão, controlada pelo Core via
  `GEO_CATALOG_SEARCH_ENABLED=true`. Não habilitar antes de validar a experiência
  de busca, permissões, Android/iOS e regressões de preços.
- Nova página ADM: `/admin/geoagent` (escopo `pricing:read` para consulta;
  `pricing:write` para importação).

## GeoAgent manual
Há dois modos, ambos **acionados manualmente**:
- **Buscar locais no OpenStreetMap:** escolha Preá, Jeri ou Jijoca e clique no
  botão. O Core consulta um perímetro fixo na API pública Overpass com limite
  de 1.500 resultados por execução, aguarda um intervalo mínimo de 90 segundos
  entre coletas e retorna candidatos para comparação; **não grava automaticamente**.
  O serviço é compartilhado e pode estar indisponível/limitar requisições.
  Não usar este endpoint para tentar varrer todo o Ceará: para grandes extratos,
  usar download regional e processamento próprio.
- **Arquivo JSON:** carregue uma lista de destinos reutilizáveis ou um objeto
  `{"places": [...]}`. Limite de 5 MiB / 10 mil registros por arquivo.
  Pode filtrar aproximadamente por Preá, Jeri ou Jijoca.

Nos dois casos:
1. O Core valida lotes de até 200 lugares e compara por `source + sourceId`,
   mostrando **novo/alterado/igual**.
2. Revise a tabela, desmarque o que não deseja e clique **Aprovar seleção**.
3. A importação é feita em lotes transacionais de até 200, idempotentes por
   fonte + ID. Se um lote falhar, os anteriores podem permanecer salvos:
   reanalise antes de tentar novamente.
4. Os lugares aprovados ficam no banco geográfico, sem mudar preços ou
   áreas autorizadas.


### Formato de registro

```json
{
  "source": "osm",
  "sourceId": "node/1234",
  "name": "Pousada Exemplo",
  "address": "Preá, Cruz - CE",
  "category": "hospedagem",
  "city": "Cruz",
  "latitude": -2.82017,
  "longitude": -40.41467
}
```

São aceitas somente as origens `osm`, `overture` e `manual`. Não inserir
respostas Google Places, Google Routes ou Geocoding neste catálogo.
Respeitar as licenças, atribuições e proveniência das fontes utilizadas.

## Integração no Core
- Migração: `backend/core/migrations/082_geo_catalog.sql`.
- Endpoints autorizados: `GET /v1/admin/geo/stats`,
  `POST /v1/admin/geo/places/collect` (apenas `pricing:write`),
  `POST /v1/admin/geo/places/preview`,
  `POST /v1/admin/geo/places/import`.
- Endpoints do passageiro usam GeoDB se ativado e houver resultados:
  `/v1/maps/places/autocomplete` e `/search`; resolução de `geo:...`
  no `/details` emite `placeProof` após classificação pela zona vigente.
- Google Places permanece como fallback. **A busca local atual não apresenta
  um botão "pesquisar mais no Google" caso já existam sugestões locais**.
  Homologar esse comportamento antes de habilitar para usuários reais.
- Endereços sem logradouro completo ganham uma descrição de cidade/região na
  resposta do Core para não quebrar o parser do Flutter.
- O provider de rotas Google agrupa requisições concorrentes idênticas, mas
  não retém traçados/ETA do Google em cache permanente.
- Métricas em `/stats` são contadores **por processo**, não estimativas de
  faturamento real, não sobrevivem a reinício do Core.

## Limitações ainda pendentes
- Não há coletas agendadas; a coleta OSM exige seu clique e aprovação.
  A extração Google e o importador Overture nativo não estão implementados.
  Public Overpass pode impor limites ou indisponibilidade.
- Não há cache de 90 dias das respostas Google. Para um cache duradouro,
  usar resultados produzidos por um motor de rotas próprio/dados com licença.
- Não há instrumentação contábil para medir os valores exatos evitados.
- Não há histórico de reversão da importação no ADM ainda.
- Não há garantia de encontrar 100% dos estabelecimentos do Ceará.
- Antes de deploy: checar testes GitHub Actions, validar end-to-end com um
  catálogo de homologação, testar Flutter Android/iOS e verificar permissões.

## Auditoria
A branch possui `.github/workflows/geoagent-review.yml`, que executa
TypeScript, migrations em PostgreSQL, testes do Core e do ADM.
O PR segue **draft**, nunca usar o status deste documento como autorização
para implantação.

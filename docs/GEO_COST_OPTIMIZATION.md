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
1. Prepare um arquivo JSON contendo uma lista de destinos reutilizáveis ou
   um objeto `{"places": [...]}`. Limites: 5 MiB / 10 mil registros por arquivo.
2. Abra **GeoAgent**, selecione o arquivo e (opcionalmente) uma das regiões
   aproximadas: Preá, Jeri ou Jijoca. O filtro se aplica somente ao arquivo.
3. Clique **Analisar e comparar**. O Core valida lotes de até 200, compara
   por `source + sourceId` e mostra **novo/alterado/igual**.
4. Revise a tabela, desmarque o que não quer publicar e clique **Aprovar
   seleção**. Nada é publicado automaticamente.
5. O Core grava lotes de até 200 transacionalmente; importações repetidas não
   duplicam o mesmo identificador da mesma fonte. Se um lote falhar, os lotes
   anteriores podem já ter sido gravados. Reanalise antes de tentar novamente.
6. Os destinos publicados ficam no catálogo geográfico, independente das
   tabelas de tarifas e das geofences.

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
- Ainda **não** há coleta automática de Google, OpenStreetMap ou Overture:
  o GeoAgent importa arquivos que você enviar e clicar para aprovar.
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

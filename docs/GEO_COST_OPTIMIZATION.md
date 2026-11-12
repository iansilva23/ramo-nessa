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

## Aprendizado automático por passageiros (novo, desligado por padrão)

O passageiro usa a pesquisa normal, sem mudança na interface Flutter. Depois
que um **passageiro autenticado seleciona e resolve um local Google**:

1. A seleção é respondida imediatamente pelo Google, como no fluxo anterior.
2. Em segundo plano, o Core registra exclusivamente o **Google `place_id`**
   e contadores agregados, **sem nome, endereço, coordenadas, identidade do
   passageiro ou texto digitado**.
3. Se a posição da seleção estiver nas regiões Preá/Jeri/Jijoca, o Core tenta
   adquirir uma trava compartilhada de atualização para essa região.
4. O GeoAgent baixa os locais **diretamente do OpenStreetMap**, com atribuição
   e dados independentes, e alimenta a GeoDB com os estabelecimentos retornados.
   O sistema jamais reaproveita nomes, endereços ou geometrias da resposta Google.
5. Com as flags de busca ativadas, futuras pesquisas que encontrem esses
   registros no GeoDB são respondidas pelo Core, sem Places para aquela busca.
6. Registros OSM vencem para **consulta** após 90 dias, até atualização;
   reconsulta regional depois de 90 dias quando sucesso e mais cedo se
   uma execução falhar ou a fonte estiver incompleta.

A integração foi feita no **Core** para servir Android e iOS pela mesma API.
O usuário só precisa selecionar um destino normalmente. O ADM mantém sua
coleta manual para correção, antecipação de atualizações e revisão.

### Flags independentes

- `GEO_PASSENGER_LEARNING_ENABLED=false` (padrão): nenhum aprendizado
  automático é disparado.
- `GEO_CATALOG_SEARCH_ENABLED=false` (padrão): a pesquisa local ainda não
  substitui o Google Places para nenhum passageiro.
- Somente após homologação e ativação deliberada é que ambas devem ficar
  `true` para a experiência completa. A coleta, mesmo ativada, depende da
  disponibilidade do OpenStreetMap e do limite por região (1.500 itens).

Os contadores persistentes aparecem no ADM `/admin/geoagent`, vindos de
`GET /v1/admin/geo/stats`. Tabelas de banco:
`geo_passenger_place_references` e `geo_passenger_learning_regions`
(migração `083_geo_passenger_learning.sql`). Nenhuma dessas tabelas contém
IDs de passageiros ou endereços de origem/destino.

A taxa de acerto não será 100%: a primeira seleção Google continua sendo
cobrada conforme o SKU; só destinos cobertos por **dados independentes e
permitidos** podem ser atendidos localmente. Rotas Google, GPS e trânsito
seguem inalterados. Nenhum cache longo de respostas Google foi criado.

## Proteção de armazenamento e manutenção (migração 084)

- No ADM `/admin/geoagent`, a nova área **Armazenamento e limpeza** mostra
  bytes reais ocupados no PostgreSQL pelas tabelas GeoDB, seus índices e
  referências do aprendizado. Esses valores **não** incluem todos os dados
  operacionais, logs ou backups do VPS.
- Limite preventivo configurável de **16 a 2048 MB** (padrão: **128 MB**).
  Alerta no ADM quando o GeoDB chegar a **80%** do limite (50–95% configurável).
  Quando o espaço já estiver acima do limite, **novos** lugares são recusados
  pela importação PostgreSQL; atualização de locais existentes continua
  disponível. Esse controle é um **limite suave** de admissão de novos
  registros, não uma cota física que impeça o crescimento dos índices.
- Pesquisa OSM expira após **90 dias** sem revalidação independente.
  A atualização regional tenta ocorrer no **75º dia**, permitindo renovar a
  validade antes de expirar. Lugares selecionados pelo passageiro têm
  contagem e data de último uso, sem identificação pessoal; registros
  populares (3+ seleções) têm prioridade.
- Registros OSM podem ser **excluídos** após **120 dias** ou mais,
  configurável até 365 dias, somente se não houver seleção nos últimos
  90 dias. **Cadastros manuais nunca entram nessa limpeza.**
  A limpeza é limitada a **100 exclusões por execução** e serializada
  com importações. O botão **Simular limpeza** não apaga nenhum registro.
  Para excluir, o administrador precisa clicar **Confirmar limpeza** e
  confirmar o aviso exibido.
- A automação diária tem duas travas independentes: a opção
  `autoCleanupEnabled` no ADM (desativada por padrão) **E** a variável
  `GEO_STORAGE_AUTOMATION_ENABLED=true` no Core (também desativada por
  padrão). Sem ambas, não há exclusão agendada. Quando armada, a tarefa
  procura regiões populares pendentes de revalidação e aplica no máximo
  uma limpeza limitada por dia.
- Migração: `084_geo_storage_maintenance.sql`; endpoints com permissões
  `GET /v1/admin/geo/stats` (`pricing:read`),
  `PUT /v1/admin/geo/storage-policy` (`pricing:write`),
  `POST /v1/admin/geo/storage-cleanup/preview` (`pricing:read`)
  e `POST /v1/admin/geo/storage-cleanup/confirm` (`pricing:write`).
- Não executamos migração nem limpeza no VPS. Os testes automatizados usam
  banco PostgreSQL temporário. Antes da homologação, validar backups,
  capacidade, eventuais bases importadas e funcionamento no ADM.

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

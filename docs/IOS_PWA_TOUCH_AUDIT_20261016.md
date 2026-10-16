# Auditoria de toques na PWA iOS — 16/10/2026

## Escopo e conclusão

Código auditado: `5aa49f6099dc418a65236af90859bc6db2a17c04`, versão web cuja ativação foi confirmada pelo operador. Nenhuma alteração de aplicação, VPS, banco, permissões ou aplicativos nativos foi executada nesta auditoria.

Há um defeito de integração confirmado no código: controles Flutter sobre o Google Maps HTML não possuem a proteção de interceptação recomendada pelo plugin. Um ensaio controlado reproduziu a perda do toque quando a camada HTML consome os eventos. Isso ainda NÃO demonstra que esse defeito explica integralmente o deslocamento vertical relatado no aplicativo instalado no iPhone. O relato anterior também envolvia uma tela sem mapa.

## Evidências e limites

| Achado | Evidência | Limite |
| --- | --- | --- |
| Controles sobre o mapa sem PointerInterceptor | PassengerHomeScreen e DriverHomeScreen usam Stack, RamoLiveMap e controles sobrepostos; dependências dos apps/design_system não incluem pointer_interceptor | A ausência é confirmada; efeito com Google SDK real no aparelho ainda precisa ser medido |
| Testes anteriores escondiam uma falha | Ativavam flt-semantics-placeholder antes de interagir; o controle com captura de eventos falha sem semântica e funciona com semântica | Não se recomenda desativar acessibilidade; o teste deve cobrir ambos os estados |
| viewport-fit removido na inicialização | Engine Flutter 3.47.5 substitui a meta viewport por outra sem viewport-fit; existe correção upstream específica | Incompatibilidade de safe area confirmada; não demonstrada como causa das coordenadas deslocadas |
| Detecção do modo instalado já existe | ramo_web_push.js verifica display-mode standalone e navigator.standalone; há detecção iOS | Detectar o nome do navegador, isoladamente, não corrige geometria |
| Engine já trata mudanças de viewport | FullPageDimensionsProvider escuta resize da visualViewport | Não há evidência para acrescentar um listener genérico como correção |

### Experimento de consumo de eventos

Workflow [38944551194](https://github.com/iansilva23/ramo-nessa/actions/runs/38944551194), commit `40f51e40008da48988cc46f958643ab77fc5a94e`.

Pacote passageiro compilado, fixture local de autenticação/mapa, WebKit Linux com simulação de standalone, viewport 430×932. Toque em (43,83; 43,83), obtido a partir da imagem do botão, sem localizador semântico no caso cold. O mapa de controle captura e interrompe propagação de eventos de ponteiro/toque/clique em seu elemento HTML.

| Mapa da fixture | Semântica Flutter | Alvo DOM | Perfil abre |
| --- | --- | --- | --- |
| Passivo | Desativada | Camada HTML | Sim |
| Passivo | Ativada | Camada semântica | Sim |
| Captura eventos | Desativada | plugins.flutter.io/google_maps_0 | Não |
| Captura eventos | Ativada | FLT-SEMANTICS | Sim |

Os quatro jobs verdes significam que o experimento terminou e registrou os resultados, não que o defeito foi corrigido. As capturas antes/depois estão nos artifacts do workflow. A fixture não é o Google Maps SDK real; não foi um iPhone físico nem uma instalação real pela Tela de Início. Leituras de geometria podem forçar layout e mascarar outros problemas de inicialização.

Ensaio anterior [38944140152](https://github.com/iansilva23/ramo-nessa/actions/runs/38944140152), com mapa passivo, não reproduziu deslocamento nos modos emulados Safari/standalone.

### Tentativa em simulador nativo

Workflow [38943551005](https://github.com/iansilva23/ramo-nessa/actions/runs/38943551005): macOS, Xcode 26.5, simulador iPhone 15 Pro Max/iOS 26.5. Inicialização do Safari e carregamento HTTPS local concluídos. A automação falhou ao abrir o menu nativo Compartilhar: o XCTest calculou ponto (-1,-1) para More e não encontrou Share. Não chegou a instalar nem abrir a PWA pela Tela de Início.

A captura final e a geometria também invalidam a tentativa de usar seu primeiro toque como prova de funcionamento: o detector escolheu (44;112,2) na tela, que virou aproximadamente (44;53,33) no documento; a captura com faixa de instalação coloca o avatar mais abaixo. Portanto, esse ensaio não comprova deslocamento do app nem funcionamento correto do avatar. A falha é do instrumento de teste e precisa ser corrigida antes de repetir o teste nativo.

## Correção recomendada, ainda não implementada

1. Proteger apenas as áreas interativas Flutter sobre o mapa com PointerInterceptor no web, incluindo controles e sobreposições relevantes. Preservar gestos nas partes livres do mapa e comportamento Android/iOS.
2. Repetir o controle com HTML consumindo eventos, com e sem semântica e primeiro toque por coordenada da imagem.
3. Corrigir a automação nativa usando a captura e os limites observados dos elementos; validar Safari e uma instalação real da PWA, desde a primeira abertura, sem ativar semântica artificialmente.
4. Medir toque e retângulos no aparelho real caso o deslocamento persista; separar safe area, teclado, retorno do segundo plano e orientação.
5. Avaliar a correção upstream de safe area separadamente. Não aplicar um deslocamento Y fixo ou alterar zoom como paliativo.

Não executar cliques automáticos em todos os botões ao iniciar. Isso acionaria funções reais e não verificaria que a posição desenhada coincide com a área de toque.

## Fontes primárias

- [google_maps_flutter_web 0.6.4](https://pub.dev/packages/google_maps_flutter_web/versions/0.6.4): seção de sobreposições sobre o HtmlElementView.
- [PointerInterceptor oficial](https://github.com/flutter/packages/tree/main/packages/pointer_interceptor/pointer_interceptor): consumo de eventos pela plataforma HTML e proteção dos widgets Flutter.
- [FullPageEmbeddingStrategy no Flutter 3.47.5](https://github.com/flutter/flutter/blob/3.47.5/engine/src/flutter/lib/web_ui/lib/src/engine/view_embedder/embedding_strategy/full_page_embedding_strategy.dart).
- [FullPageDimensionsProvider no Flutter 3.47.5](https://github.com/flutter/flutter/blob/3.47.5/engine/src/flutter/lib/web_ui/lib/src/engine/view_embedder/dimensions_provider/full_page_dimensions_provider.dart).
- [Correção upstream de viewPadding/safe area](https://github.com/flutter/flutter/commit/0748e48b3a113497b83f428047d21d29ad4ed994).

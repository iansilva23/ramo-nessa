# Revisão ampliada dos mapas — Passageiro e Motorista Web

## Contexto e alcance

Ian confirmou que o mapa branco aparece nos **dois aplicativos Web instalados
na tela inicial do iPhone**, usando o motor do Safari. O desenho volta depois
de tocar/movimentar a tela. A revisão foi ampliada para os fluxos dos mapas,
sem limitar a investigação a esse sintoma ou presumir uma única causa.

Base auditada: `9a9deaceb278f4695eb344b9e3d64f5952d63ef3`, PR DRAFT #36.
Correções adicionais: `8fb4435d04a5eed9f38cbd54adf6a0f691af5024` e
`f57d5b2bda01ba202da4f48a9fed99784040b85f`. Ajuste adicional do alfinete:
`07d1b245169e788550c26a5e4eb1fe2cda559242` (ver limite de CI abaixo).
O diagnóstico inicial está em `WEB_MAP_ROUTE_INVESTIGATION_20261021.md`.

Não houve instalação na VPS, reset do catálogo, mudança de tarifas, banco,
pagamentos, credenciais ou dependências. Android/iOS não foram atualizados;
as proteções novas são condicionadas ao Web, mantendo o caminho nativo.

## Defeitos confirmados e corrigidos na candidata

| Área | Condição encontrada | Resultado da correção |
|---|---|---|
| Câmera dos dois Web | Leitura de zoom imediatamente após fitBounds podia observar o zoom anterior e disparar um segundo comando | Centro e zoom finais calculados antes de chamar o SDK, sem leitura prematura; correção inicial 4d307ea |
| Painel do Passageiro | Plugin Web não aplica as margens do mapa como os SDKs nativos | Enquadramento considera o viewport e o espaço dos controles/cartão; correção inicial 4d307ea |
| GPS inicial do Passageiro | GPS ou classificação remota podiam terminar depois de o usuário escolher manualmente outra origem | Respostas ligadas à seleção anterior não substituem a origem escolhida |
| Troca de destino do Passageiro | Carregamento da política acontecia antes da proteção de concorrência da rota; uma seleção antiga podia iniciar uma rota depois da nova | Revalidar seleção e montagem após carregar a política, antes de consultar a rota |
| Endereço salvo do Passageiro | Validação assíncrona de um endereço salvo verificava apenas se a tela estava montada | A validação também respeita a revisão da busca; não fecha uma busca mais recente nem devolve seleção antiga |
| Mapa do Motorista pronto/recriado | Rota podia chegar antes do mapa ficar pronto; callback do pai centralizava apenas no motorista | Quando o mapa fica pronto, a rota carregada é enquadrada com todos os seus pontos, inclusive após recriação |

Esses defeitos são verificáveis no código e nos testes. **Eles não provam,
isoladamente, a causa completa da tela branca no iPhone de Ian.**

| Encerramento do alfinete | Tela chamava dispose no controlador e o GoogleMap também encerrava o mesmo SDK | No Web, apenas o GoogleMap encerra o SDK; teste abre/fecha duas instâncias e exige um descarte por instância |

## Outras áreas conferidas

| Área | Evidência encontrada | Limite |
|---|---|---|
| Busca e autocomplete | Debounce, sessões Places, descarte de sugestões/detalhes atrasados e consultas via Core | Provedor Google real e qualidade dos resultados locais exigem sessão conectada |
| Rede e geometria | Consultas de busca/rota têm timeout; parsing rejeita GPS impossível, geometria malformada e saltos incompatíveis com a distância | Não simula recepção de sinal/tiles no aparelho ou indisponibilidade real do provedor |
| Zoom e telas | Projeção considera margens, pontos iguais, trajetos horizontais/verticais e antimeridiano; testes em cinco tamanhos | São testes de geometria/layout, não capturas de Google Maps real nessas telas |
| Marcadores e animações | Assets aprovados, fallback de ícone, movimento ao longo da rota, verificação de montagem antes de aplicar ícones, descarte dos controladores de animação | Desempenho GPU, memória e composição no PWA do iPhone ainda precisam de medição real |
| Acompanhamento do Passageiro | Eventos de outra corrida descartados; HTTP antigo não reverte realtime; GPS antigo/inválido não pede rota; mudança de etapa invalida resposta antiga | Reconexão real ao bloquear/desbloquear ainda depende de homologação |
| Rota do Motorista | Identidade da corrida, etapa e revisão protegem respostas; política limita recálculos; rota existente é preservada durante falha do provedor | A qualidade da navegação/ETA depende de GPS e provedor reais |
| Controles sobre o mapa | PointerInterceptor envolve controles pintados; o componente compartilhado orienta não cobrir a área livre com interceptores | Testes sintéticos anteriores não substituem toques no PWA instalado |
| Segundo plano | Motorista já possui política Web de pausa segura da disponibilidade, sem tornar automaticamente disponível novamente; acompanhamento usa realtime com fallback HTTP | PWA não garante GPS ou execução contínua com tela bloqueada |
| Entrada e instalação | Manifestos usam standalone; tela inicial tem bloqueio/gesto próprio; HTML usa chave Web injetada na compilação | Nenhuma chave foi trocada; não foi limpo cache/storage nem removida sessão do usuário |

WebKit documenta a suspensão de páginas inativas no iOS e a conveniência de
atualizar conteúdo ao voltar à visibilidade:
https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/
Isso é uma limitação de execução em segundo plano, não uma comprovação de que
ela cause o defeito de pintura relatado ao selecionar rota em primeiro plano.

## Testes e evidências

Execução da revisão ampliada aprovada:
https://github.com/iansilva23/ramo-nessa/actions/runs/39535853267

Seis jobs aprovados: Passageiro (190 testes de host, quatro testes de seleção
no Chrome, dois testes de câmera, quatro de projeção e dois de catálogo Web,
além do build release), Motorista (111 testes de host, três de câmera/prontidão
no Chrome e build), Core, PostgreSQL, ADM e browser Chromium/WebKit.

A correção adicional do encerramento do alfinete está no commit
07d1b245169e788550c26a5e4eb1fe2cda559242. O teste de ciclo de vida usa
os componentes reais GoogleMap/GoogleMapController com a interface de SDK
substituída por um contador e exige um descarte por instância ao abrir/fechar
duas vezes. A execução adicional 39620905543 iniciou e falhou no fixture, que não
implementava updateTileOverlays, chamado pelo próprio SDK durante a criação.
O fixture foi completado sem alterar a proteção de descarte da candidata;
nova revisão de testes: c6390a6d55610c5bcb45d78ddd03b623d23fe124.
Não se considera esse ajuste adicional homologado antes da aprovação dessa
rodada. A suíte anterior aprovada não substitui o teste novo.

A primeira rodada identificou timers de uma consulta opcional de conteúdo
no fixture da tela inicial (divulgação e consulta de versão). Esses serviços passaram a ser explicitamente
injetado no teste, evitando chamadas implícitas de rede e permitindo encerrar
a tela sem timers pendentes. Correções apenas do isolamento dos testes: 0dd0ded4447cdbf567518c6b63a919a3b59c6328 e 897cf841bcce2d253aa3c688390153b96f65b577.

Novos testes em Chrome:

- GPS atrasado não substitui a origem escolhida na tela real.
- Classificação de coordenada atrasada não substitui a origem escolhida.
- Política atrasada de destino antigo não inicia uma rota obsoleta.
- Validação atrasada de endereço salvo não fecha uma busca mais recente.
- Rota carregada é enquadrada quando o mapa do Motorista fica pronto e
  novamente quando o widget é recriado.

O primeiro teste de enquadramento usa o controlador real e uma interface de SDK
gravadora que devolve deliberadamente zoom antigo. O teste de mapa pronto usa
o widget real do Motorista com tiles desativados e um controlador gravador.
Os testes de seleção usam telas reais, serviços controlados e respostas
assíncronas, sem chamadas ao servidor real ou ao Google.

A revisão executa também análise, testes existentes dos dois aplicativos,
projeção compartilhada, builds release Web, Core, PostgreSQL e regressão do ADM
em Chromium/WebKit. Os bundles de revisão apontam para example.invalid e não
são distribuíveis para instalar na homologação.

## Registro de rede complementar

Foi analisado localmente o HAR do aplicativo enviado pelo proprietário. O JSON
está incompleto no final; foram recuperadas **58 entradas completas**, sem
alterar o arquivo original. Nessas entradas, todas as respostas têm status 200.
O JavaScript principal do Passageiro levou aproximadamente 18,85 segundos e o
CanvasKit WebAssembly 13,26 segundos; o carregador Google Maps, 0,36 segundo.
Essas durações não devem ser somadas automaticamente, pois os downloads podem
se sobrepor. O trecho é do carregamento do Passageiro e não contém requisições
/v1/maps/route; não é evidência de seleção de rota no PWA do iPhone nem de erro
de renderização. Não permite concluir que não há falhas nas entradas ausentes.

Há evidência de lentidão na primeira carga em uma captura, que deve ser
tratada separadamente da tela branca após escolher rota. Não foram alterados
Caddy, cache, compressão ou infraestrutura, que têm investigação própria.
Tokens, query strings, conteúdo de respostas, dados pessoais e o próprio HAR
não foram incluídos no GitHub. Apenas métricas agregadas e nomes de assets.

Também foram conferidos o seletor de alfinete, a apresentação de escolha de
veículo, o componente de preview e a abertura da navegação externa do Motorista.
Nenhum código de preview/futuro foi removido. A navegação externa valida
coordenadas finitas e seus limites antes de montar o destino HTTPS; a abertura
real de outro aplicativo continua no roteiro do aparelho.

## Aceite real pendente

Não há iPhone físico conectado ao executor. O navegador público chega à entrada
do Passageiro e a seleção de rota exige login. Não foi contornada autenticação,
criada conta de teste no ambiente real ou alterada a configuração de segurança.

Após autorização específica e instalação somente dos Web configurados, validar
no iPhone instalado na tela inicial, nos dois aplicativos:

1. Abertura fria, GPS permitido/negado e recuperação após permissão.
2. Busca, teclado aberto/fechado, escolha de endereço salvo e retorno ao mapa.
3. Origem/destino alterados rapidamente e seleção enquanto GPS ainda carrega.
4. Rota curta/longa; mapa e linha devem carregar sem gesto de ajuda.
5. Zoom/arraste manual; atualizações ordinárias não devem roubar o enquadramento.
6. Oferta, ida ao passageiro, chegada, início, percurso e conclusão da corrida.
7. Troca de aba/tela, retorno do perfil/chat e recriação do mapa do Motorista.
8. Bloquear/desbloquear tela, alternar para outro app e voltar.
9. Rede lenta, perda/retorno de conexão e dados/GPS antigos claramente tratados.
10. Modo claro/escuro, retrato/paisagem quando permitido pelo aparelho e controles acessíveis.

Registrar versão do iOS, modelo do iPhone e vídeo caso a tela branca persista.
Antes de nova correção de renderização, capturar console e falhas de carregamento
na mesma sessão, sem divulgar tokens, chaves, dados pessoais ou localização real.
Não orientar o usuário a apagar dados/reinstalar como substituto do diagnóstico.

O mapa branco não está marcado como resolvido em aparelho real. A candidata
continua no PR DRAFT e aguarda homologação conectada, sem merge ou implantação.


## Preparação da atualização dos dois Web

A revisão c6390a6d55610c5bcb45d78ddd03b623d23fe124 prepara bundles configurados
com os caminhos /passageiro/ e /motorista/, Firebase e chave Maps Web já
existentes. A rotina não implanta. O pacote passa pela verificação do manifesto
e pelos fluxos compilados de login, recuperação de sessão e logout em Chromium
e WebKit com serviços sintéticos. Esses testes não homologam tiles Google reais.

A ferramenta prepare-web-map-update.mjs é exclusivamente de preparação na VPS:

- Requer o ZIP configurado e seu SHA-256 confirmado; rejeita arquivos simbólicos,
  pacotes de revisão e divergências no manifesto/arquivos.
- Confere a ativação Web previamente fornecida pelo operador e o hash completo
  dos Web ativos. Se os aplicativos mudaram desde então, interrompe para evitar
  sobrescrever trabalho de outra branch/chat.
- Confere que a diferença de fontes dos apps se limita aos arquivos dos mapas.
- Compara Maps/Firebase dos novos pacotes com os Web atualmente instalados.
- Preserva a imagem do Gateway/ADM, o Caddy atual, os serviços e o ambiente
  resolvido. Guarda os modelos privados de candidata e retorno.
- Só grava a candidata em um novo diretório e o plano privado. Não executa
  compose up, SQL, migrações, reset, troca de mount ou reinício.
- Recusa repetir uma preparação existente; nenhum diretório ativo é apagado.

O validador de ZIP anterior mantém os defaults imutáveis da ativação original;
a revisão nova é informada explicitamente apenas pela ferramenta dos mapas.
Seis testes Python de staging e quatro contratos Node da preparação passaram
localmente. Os contratos compartilhados de mudança exclusiva do mount também
são executados pela revisão CI. Não houve execução desta ferramenta na VPS.

O comando operacional completo só deve ser fornecido após obter o pacote
configurado aprovado e seus hashes. Não reutilizar activate-regions-pricing.mjs
nem o reset para atualizar mapas. Instalação, prova pública dos arquivos e
retorno precisam de autorização específica e permanecem separados da preparação.


## Pacote aprovado e correção do ensaio de instalação

A revisão `c6390a6d55610c5bcb45d78ddd03b623d23fe124` passou nos seis jobs
Web/Core/PostgreSQL/ADM/browser do run 39623810684. O pacote configurado dos
dois Web passou no run 39623811345, incluindo os fluxos compilados de sessão
em Chromium e WebKit (serviços sintéticos). Artifact 12355793923, 36.920.908 bytes,
SHA-256 `872e17e87dedd8cf8410b5e0103c5ba1f0a747aaa94e4b6e16c2e86d3338b19a`.
O ZIP foi baixado e validado localmente: manifesto da revisão c6390a6d, 108 arquivos,
94.485.882 bytes expandidos, sem arquivos extras ou divergências de integridade.

A falha do run 39623357343 foi localizada: prepare-regions-activation.mjs usa
`git diff --exit-code staged.sourceCommit prepared.revision -- apps/passenger
apps/driver packages`. O ensaio baixava o ZIP original fa5ad133 e preparava a
HEAD nova, que intencionalmente já contém as correções de mapas. O comando
recusou combinar fontes distintas. Não houve falha do motor, perda de dados ou
execução na VPS. O ensaio original agora prepara a revisão e24a5ecb, cujas fontes
desses três diretórios são idênticas às do ZIP original, sem remover a proteção.

A revisão operacional 9ab768635d8763db030e8aa850f11be5dabcdf5a acrescenta ensaios
reais isolados para o pacote novo: preparação sem alterar serviços, troca exclusiva
do bind dos dois Web com a imagem Gateway atual, prova HTTP dos arquivos, comparação
do catálogo/corridas/pagamentos/ledger antes e depois, e falha sintética após troca
para comprovar o retorno. O ensaio original de rollback do catálogo é preservado
em cenário separado. Esse reset só ocorre no banco sintético criado pelo CI.

activate-web-map-update.mjs requer o plano privado e seu SHA-256, valida hashes dos
modelos e bundles, identidades de todos os serviços, Caddy e configuração atual.
Somente recria o Gateway usando a mesma imagem e o mesmo ambiente. Não executa SQL,
reset, migrações, build, atualização do Core/ADM ou alterações nativas. Verifica
os arquivos publicados dos dois Web; falhas disparam retorno ao bind anterior e
conferência. Se outra operação alterar o Gateway, recusa sobrescrevê-la no retorno.
O journal registra completed, rolled-back ou requires-review sem alegar recuperação
quando ela não foi confirmada. Nenhum dado privado deve ser enviado nos logs.

Os 18 contratos Node e seis casos Python locais passaram. O resultado dos ensaios
Docker/HTTP da revisão operacional deve ser consultado antes de fornecer o comando
de instalação. O pacote não foi instalado na VPS e a tela branca permanece pendente
de homologação física no iPhone/PWA dos dois aplicativos.


Resultado dos ensaios operacionais de 9ab768635d8763db030e8aa850f11be5dabcdf5a:
run 39631036259 aprovado nos três cenários: success, rollback_after_reset e
map_rollback. O cenário success ativou de fato o pacote novo em Gateway/Caddy
isolados e confirmou os bytes via HTTP. O cenário map_rollback provocou erro
após a troca e a verificação dos arquivos, restaurou o bind anterior e verificou
sua publicação. Nos dois casos, catálogo, corridas, pagamentos e ledger foram
comparados antes/depois e permaneceram idênticos. O teste legado do catálogo
voltou a passar preservando sua barreira de identidade das fontes. A validação
leve de preparação/ativação também passou no run 39631036217.

Esses resultados autorizam a preparação para homologação, não comprovam o
comportamento da GPU/tiles Google no iPhone. Não houve execução na VPS real.

A revisão Web completa da mesma revisão operacional também passou: run
39631036362, seis jobs aprovados (Core, PostgreSQL, ADM, navegador, Passageiro
e Motorista). Inclui o teste do ciclo de vida do alfinete Web corrigido, os
testes de câmera no Chrome sem toque e ambos os builds release. Nenhuma
verificação pendente é tratada como aprovada; aceitação no iPhone continua aberta.


## Evidência física após instalar c6390a6d — ainda não resolvido

O operador executou a atualização Web e informou MAPAS_WEB_ATUALIZADOS com fonte
c6390a6d55610c5bcb45d78ddd03b623d23fe124. Plano da VPS:
/opt/ramo-nessa-regions/map-web-updates/c6390a6d5561/prepared.private.json,
SHA-256 dd59053306a0646817c4e7c4423332690a019834172fd8e7e5c7a4cc0158742a.
Core/ADM/reset/nativos false, provedores preservados. Não repetir essa instalação.

O usuário confirmou que o fundo vazio persiste. Três capturas do Passageiro no
iPhone/PWA mostram: marcadores/controles/resumo da rota e atribuição Google no
fundo vazio; no primeiro gesto, overlay 'Use dois dedos para mover o mapa'; após
outro gesto, tiles do mapa aparecem. Essas capturas foram vistas na conversa;
não foram incluídas no repositório. Isso comprova o sintoma e o modo cooperativo,
não sua causa interna de renderização. C639 não é considerada correção aprovada
em aparelho real. Nenhuma captura/conta/localização pessoal foi publicada.

O SDK Web 0.6.4 converte webGestureHandling ausente para 'auto'; uma opção
explícita tem precedência sobre scrollGesturesEnabled/zoomGesturesEnabled.
https://github.com/flutter/packages/blob/google_maps_flutter_web-v0.6.4/packages/google_maps_flutter/google_maps_flutter_web/lib/src/convert.dart
Por isso os mapas principais passam a solicitar greedy (arraste com um dedo),
e o alfinete solicita none durante o salvamento, preservando o bloqueio anterior.
https://developers.google.com/maps/documentation/javascript/interaction

Outro problema identificável no código: Navigator.push devolve o endereço no
pop antes de terminar a animação de saída. A busca instantânea/cache pode mover
um HtmlElementView ainda encoberto/offstage. A candidata Web espera
searchRoute.completed e o frame de layout antes de entregar a seleção à tela
principal. Não usa timeout fixo, zoom artificial, gesto sintético, recriação
contínua do mapa ou mudança de chaves. O comportamento nativo conserva o retorno
pelo popped, sem esperar a transição adicional.
https://api.flutter.dev/flutter/widgets/TransitionRoute/completed.html

A hipótese de que essa corrida de transição causa o fundo vazio no iPhone ainda
precisa de homologação física. O teste novo verifica precisamente a ordem:
nenhuma chamada de rota durante a animação reversa; uma chamada correta após a
volta. A revisão CI também executa o mesmo teste contra o fonte instalado para
comprovar que ele falha pela assertiva esperada antes de validar a candidata.
Os checks compilados de sessão agora inspecionam as opções recebidas pelo stub
JS pelo plugin real em Chromium e WebKit no Passageiro. O fixture de login do
Motorista não fornece cadastro operacional/GPS e continua verificando somente
sessão, sem alegar cobertura de seu mapa. Isso comprova entrega de greedy ao
SDK do Passageiro, não desenho real dos tiles ou equivalência com Safari físico.


Pacote da candidata física seguinte: 0a6d4240e55e71dc8e841799bc0c3a01fcb4a375,
artifact 12362030461 do run 39635682131 aprovado. SHA-256:
92a13615a015c5f08fe4480506666db3e09c5c61b67b0fcc493e496be7d7cae1.
Baixado e validado localmente: 108 arquivos, 94.486.846 bytes expandidos,
manifesto correto. assertMapProviders confirmou Maps/Firebase iguais aos bundles
c639 nos dois aplicativos, sem exibir valores. Os quatro checks compilados de
sessão passaram (ambos os papéis × Chromium/WebKit); opções recebidas pelo SDK
simulado são verificadas no Passageiro. O Motorista segue com sessão/compilação,
sem alegar que seu fixture de login entrou em operação com GPS.

Ferramentas operacionais 619775b33f92f5e80a4f27a3f144965d1d040e14:
run 39636514810 aprovado nos três cenários. O CI primeiro recriou a instalação
c639 usando as ferramentas anteriores e depois atualizou para o pacote 0a6d.
O cenário map_rollback falhou de propósito após verificar a troca e comprovou
retorno ao c639 com os arquivos públicos corretos. Catálogo/corridas/pagamentos/
ledger permaneceram iguais durante o upgrade/retorno dos mapas. O rollback do
reset antigo só foi exercitado em banco sintético no cenário legado separado.
O run leve 39636514723 também passou. Não houve segunda instalação na VPS real.

Os erros intermediários do CI não são falhas de renderização: o teste de
comparação da transição inicialmente não tinha histórico Git e depois usava rg,
que não está instalado no runner. A revisão usa fetch-depth 0, grep disponível
e diagnóstico Flutter que preserva o handler de falhas original. Não remove
assertivas nem considera um timeout do fixture como evidência da tela branca.

## Candidata seguinte: patch oficial do plugin Maps Web

A candidata 0a6d acima não foi instalada. Foi substituída pela revisão
0ad3ba73cfe2a1265344de09c75309b95daac8dd, que conserva gesto/transição e altera
somente google_maps_flutter_web de 0.6.4 para 0.6.4+2 nos locks de ambos os apps.
Nenhuma dependência Android/iOS ou outra entrada de dependência foi alterada.
Hash publicado do pacote: de408355e21b0da7da17962b86c338d320d9bc1c5eb94e72a2d021955bda5aaa.

O changelog oficial descreve onMapCreated bloqueado se uma requisição de tile
falhar/atrasar. O patch aceita também idle quando o elemento está conectado e
com dimensões positivas, em vez de depender exclusivamente de tilesloaded.
https://github.com/flutter/packages/blob/google_maps_flutter_web-v0.6.4%2B2/packages/google_maps_flutter/google_maps_flutter_web/CHANGELOG.md
https://github.com/flutter/packages/blob/google_maps_flutter_web-v0.6.4%2B2/packages/google_maps_flutter/google_maps_flutter_web/lib/src/google_maps_controller.dart
https://pub.dev/api/packages/google_maps_flutter_web/versions/0.6.4%2B2

Prova negativa: o teste compilado com GPS sintético e tilesloaded suprimido
falhou pela sentinela WEB_MAP_NOT_READY_WITH_STALLED_TILES no bundle 0a6d com
plugin anterior. O mesmo cenário passou no Passenger Chromium/WebKit com o
patch; os checks de sessão Driver passaram nos dois engines. O stub não baixa
tiles reais nem emula GPU/Safari físico. Isso é uma falha reproduzida da
biblioteca; ainda não prova que ela explica integralmente o relato físico.

Run 39641033029 aprovado e artifact configurado 12365640705. SHA-256 ZIP:
392f89862e0a46ad7010cb44618f2110f87cb1e3fd860e7c135beefefa84b46e.
Validação local: 108 arquivos, 94.498.591 bytes expandidos; manifesto/fonte/hashes
corretos; Maps/Firebase públicos iguais ao c639 nos dois aplicativos.
Run 39641032929: seis jobs aprovados, incluindo transição (cinco casos), alfinete
(dois), câmeras e builds. Contratos operacionais locais: 22 Node e seis Python
aprovados. Ferramentas dd9b68bc149a37c0456f5b05e229d426a5ed1455 exigem base c639,
fonte 0ad e somente o patch Web exato nos locks. Recusam outra atualização
concorrente ou alteração de dependências nativas. Não houve segunda instalação
na VPS; aceitação física segue pendente.

Run 39670229404 da revisão operacional dd9b: três cenários aprovados. O ensaio
instalou primeiro c639 e depois o pacote 0ad verificado, confirmou publicação
HTTP dos dois aplicativos e, no cenário map_rollback, provocou falha após a
troca para verificar a restauração ao c639. Catálogo, corridas, pagamentos e
ledger foram comparados antes/depois e permaneceram iguais no upgrade/retorno
dos mapas. O cenário legado de rollback do catálogo foi exercitado somente em
banco sintético. Run 39670229542 também aprovado nos contratos operacionais.

## Retorno do operador e correção posterior de regiões

O operador confirmou MAPAS_WEB_ATUALIZADOS com fonte
0ad3ba73cfe2a1265344de09c75309b95daac8dd e plano
74b6fed1673311134dfe6af7d3b48ad6578037f300c27a415534c02012375b94.
Em seguida confirmou sucesso do mapa no iPhone/PWA. Essa confirmação encerra o
sintoma relatado no Passageiro; não equivale a teste operacional do Motorista.
A base 0ad e seu patch de mapa são preservados na correção de disponibilidade de
regiões cadastradas no ADM, documentada em MANAGED_REGION_ROUTES_FIX_20261021.md.

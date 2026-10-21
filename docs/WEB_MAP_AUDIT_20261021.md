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
duas vezes. Sua execução adicional em CI ainda não apareceu para esse commit;
não se considera esse ajuste adicional homologado. A suíte anterior aprovada
não substitui esse teste novo.

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

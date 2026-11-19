# Destino compacto, notificações e nomes dos locais

Escopo autorizado em “Continuar PR Web Permissões”, retomado em 26/10/2026.
PR: https://github.com/iansilva23/ramo-nessa/pull/77
Branch: `feature/passenger-polish-push-places-20261026`.
Base: `ops/asaas-production-sender-20261025`, `2e0c61cc273ee276c03a4670bf2fa57573f900be`.

## Comportamento

- O aviso “Escolha seu destino” usa menos altura, título menor e a superfície do painel. A seleção, o mapa, a cotação e a confirmação continuam usando os fluxos existentes.
- Nome e endereço do estabelecimento selecionado via busca são enviados separadamente. Os nomes persistem em colunas opcionais `pickup_label` e `dropoff_label`, migration 098. Coordenadas e referências de zona/localidade continuam responsáveis pela tarifa. Ofertas, corrida ativa, acompanhamento e histórico recebem os nomes; registros antigos usam os fallbacks existentes.
- Android/iOS tratam notificações recebidas em primeiro plano e o toque com o aplicativo em segundo plano ou aberto pelo sistema. Web/PWA transporta somente tipo e identificador da corrida ao próprio aplicativo. O toque não aceita corridas, não cria pagamento e não executa ações de viagem.
- O passageiro confere a corrida na consulta autenticada antes de navegar; mensagens abrem o chat correspondente. O motorista recupera sua atribuição/oferta atual pelo servidor e abre o chat somente quando corresponde à sua corrida atual. Em primeiro plano, avisos de corrida oferecem a ação “Ver”.
- O ADM informa aceite pelo provedor, sem apresentar esse contador como confirmação de recebimento pelo aparelho.

Satélite e distorção dos ícones continuam adiados. Nenhum merge, deploy ou ativação de recursos operacionais faz parte desta revisão.

## Retomada e correções

O commit inicial `37c0071ee20fc841292fa0a32d4d963049c57bc7` foi encontrado no GitHub. A execução 40280908500 falhou em compilação/análise e testes do ADM.

Correções `c588a8466874d3c06c6ad32dcc35559deefd9065`:
- tipo explícito para os metadados FCM;
- mapa recebe um `RamoPlace` com nome do local, preservando suas coordenadas;
- modelo e resposta de histórico do motorista incluem os nomes;
- invalidação da geração antes de aguardar encerramento dos listeners no logout;
- notificações de pagamento do passageiro são reconhecidas como relacionadas à corrida;
- testes de regressão de nomes e intents.

Complemento `5f51e1f7b9fd714ded24801afb034de0c292f2fd`:
- chat do passageiro abre diretamente após consulta autenticada;
- ação de primeiro plano recupera a corrida;
- testes do ADM acompanham textos e nomes acessíveis dos componentes atuais;
- testes do worker verificam o clique em janela existente e abertura do aplicativo fechado, nos dois papéis;
- teste de navegação verifica chat, pagamento e rejeição de identificador ausente na consulta do passageiro.

## Validação

Local: tipos do Core; 177 testes ADM; 16 testes de preparação/push; 10 testes do worker. Também passaram 12 testes de acompanhamento/oferta/recuperação; o cenário PostgreSQL desse grupo não foi executado localmente.

Na execução intermediária 40324474219, Core com PostgreSQL/migrações e shared UI passaram. Os testes do ADM ainda procuravam nomes acessíveis anteriores e foram corrigidos no complemento.

Execução final aprovada: https://github.com/iansilva23/ramo-nessa/actions/runs/40324966168 (tentativa 2), fonte `5f51e1f7b9fd714ded24801afb034de0c292f2fd`. Todos os dez grupos aprovados.

- Core: 911 testes aprovados, 18 cenários condicionais não executados, zero falhas; migrações executadas duas vezes e compilação aprovada.
- ADM: 177 testes; configurações de embarque e ocorrências em Chromium/WebKit aprovadas.
- Push Web: 10 testes do worker, incluindo janela existente, abertura a frio e isolamento entre papéis.
- Passageiro: 249 testes Flutter, análise e build Web aprovados.
- Motorista: 140 testes Flutter, análise e build Web aprovados.
- Atividades dos dois aplicativos: recuperação da mesma corrida/pagamento e suporte vinculado aprovados em Chromium e WebKit.
- Compilações Android Passageiro/Motorista e iOS simulador Passageiro/Motorista aprovadas, sem assinatura de distribuição.
- Interface compartilhada e três verificações do inspetor de instalação aprovadas.

A primeira tentativa teve nove grupos aprovados; o grupo ADM WebKit atingiu o limite de tempo durante o download de pacotes do Ubuntu, antes dos testes. Foi repetido isoladamente, sem alteração do código, e aprovado. A repetição não substitui os testes de aparelhos reais.

## Limites e próxima etapa operacional

Compilações de revisão não são APKs de distribuição nem IPAs assinados. Notificações em aparelhos reais, em primeiro plano, segundo plano, tela bloqueada e abertura pelo toque ainda precisam de homologação com aplicativos instalados, permissões e configuração reais. Encerramento forçado e restrições do sistema/navegador podem afetar a entrega; não há garantia de entrega comprovada por aceite do FCM.

A VPS não foi acessada nesta retomada. O código exige migração compatível antes de executar o Core novo; o pacote precisa preservar os provedores/configuração pública vigentes. Não executar um deploy apenas copiando os builds de revisão.

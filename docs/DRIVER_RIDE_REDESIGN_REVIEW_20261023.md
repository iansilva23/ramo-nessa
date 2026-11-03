# Revisão do redesign do Motorista — 23/10/2026

Status: PR em DRAFT; análise, 117 testes e compilação aprovados nas três execuções de CI. Homologação visual e testes em dispositivos reais pendentes.

## Base e recuperação

Branch: `feature/driver-ride-redesign-20261023`. Base: `a2a06cf3f720e0e80ef09e738fbbd212200f598a`, ponta de `fix/checkout-reservation-window-20261023`.

A manutenção automática do workspace removeu a cópia local antes do push. Os commits anteriores `438c572e` e `6cbe9e69` não existem no GitHub e não foram encontrados nos arquivos salvos. A base foi clonada novamente e as alterações reconstruídas a partir do código e do diff registrados na conversa. Não se afirma recuperação byte a byte dos commits antigos. A revisão reconstruída exige nova execução de testes. O usuário autorizou explicitamente o envio da branch e do workflow; não autorizou merge ou deploy.

## Componentes e quatro telas

`driver_home_screen.dart` conserva os estados e as ações reais. O novo arquivo parcial `widgets/driver_ride_design.dart` define a apresentação específica dos cartões sobre o mapa.

1. **Nova corrida:** `_DriverOfferDesign`, cabeçalho preto, selo amarelo, contador baseado em `expiresAt`, ganho líquido real, categoria, percurso, métricas e callbacks existentes de aceite/recusa.
2. **Indo buscar:** `_DriverActiveDesign` recebe `DRIVER_ASSIGNED`/`DRIVER_ARRIVING`, preservando mensagem, navegação, cancelamento e chegada.
3. **Em andamento:** o mesmo componente recebe `IN_PROGRESS`. Chegada ao destino e finalização chamam a operação existente de conclusão, sem novo estado no servidor.
4. **Finalizada:** mantém somente uma apresentação local do retorno da conclusão; a corrida deixa de estar ativa no mapa. Fechar o resumo não chama a liquidação novamente.

Os estados intermediários `AWAITING_PAYMENT` e `DRIVER_ARRIVED` preservam os controles existentes, inclusive espera por pagamento e início da corrida. O uso de `_ActiveRideCard` na aba Atividade conserva o layout anterior, sem exigir callback de minimização.

## Minimização e responsividade

O retângulo existente `_ActiveRideCompactBar` foi adaptado para oferta, deslocamento, viagem e resumo final. Um único ramo monta o cartão ou o retângulo. Arrastar o indicador para baixo minimiza; tocar no retângulo restaura. O resumo recebe o estado atual e usa a identidade da corrida, sem novas chamadas de servidor. O prazo vem de `expiresAt` e não reinicia ao alternar a apresentação.

O quadro limita a largura a 480 px e a altura ao espaço útil do mapa. Informações têm rolagem interna, enquanto indicador e ações ficam fora da rolagem. Em áreas com menos de 360 px de altura o título acompanha a rolagem para preservar o acesso às ações. O aviso financeiro de conclusão foi posicionado acima do retângulo, preservando a mensagem sem bloquear a restauração. As áreas seguras e a barra inferior foram preservadas. Essas medidas ainda exigem revisão em telas pequenas, navegador móvel e texto ampliado.

## Testes e plataformas

Verificações locais: `git diff --check` e validação de sintaxe/formatação com Dart 3.13.7 instalado durante a retomada. Flutter não está disponível localmente; testes e compilações foram executados no GitHub Actions, não neste ambiente.

Testes preparados:

- `driver_flow_test.dart`: minimização/restauração de oferta, deslocamento, viagem e resumo; navegação externa; início; somente uma conclusão financeira; preservação de Atividade; fluxo completo em 320 × 568, 320 × 640, 375 × 667, 390 × 844 e 430 × 932, incluindo resumo final e acesso aos controles.
- `realtime_offer_test.dart`: mudança de etapa minimizada, restauração atualizada, retirada da representação encerrada e nova corrida sem cartão obsoleto.

O workflow `driver-ride-redesign-review.yml` executa análise, testes e builds Web, APK debug e iOS simulador, sem deploy e sem acesso a segredos de produção. Os resultados executados estão registrados abaixo na seção de evidências. Código compartilhado alcança Web/Android/iOS, mas não comprova homologação nessas plataformas.

## Pendências de aceitação

- Comparação renderizada com as quatro imagens aprovadas e testes em dispositivos reais.
- Testes reais de mensagens, cancelamento, expiração, recusa, conectividade e navegação externa.
- O contrato atual não fornece tarifa total nem tempo/distância totais de conclusão. Campos indisponíveis exibem “—”; ganho líquido não é apresentado como tarifa total. Tempo decorrido não é substituído por ETA.
- Não existe ação de avaliação de passageiro em `DriverApi`; o botão visual fica desabilitado. Não foi criado processo fictício.
- A fração visual do anel usa referência de 35 segundos; o número e a disponibilidade das ações obedecem ao prazo real. Conferir a duração configurável antes da aprovação visual final.
- A implementação não está pronta para publicação enquanto os critérios acima e as verificações de CI não forem concluídos.

## Arquivos e preservação

Arquivos do conjunto: `.github/workflows/driver-ride-redesign-review.yml`, `apps/driver/lib/src/features/home/presentation/driver_home_screen.dart`, `apps/driver/lib/src/features/home/presentation/widgets/driver_ride_design.dart`, `apps/driver/test/driver_flow_test.dart`, `apps/driver/test/realtime_offer_test.dart` e este relatório.

O diff não altera arquivos do backend, API, banco, preços, comissões, repasses, ADM, Passageiro, cartografia, marcadores, câmera ou serviços de localização/navegação. As ações reais continuam vinculadas aos callbacks existentes. Essa constatação de escopo não substitui regressão. Nenhum merge, alteração na VPS ou publicação nas lojas faz parte desta execução.

## Evidências da execução autorizada

- PR: https://github.com/iansilva23/ramo-nessa/pull/43 — DRAFT.
- Revisão de código testada: `a133772531357e00eaa6ab385d06705dde610735`.
- Execução: https://github.com/iansilva23/ramo-nessa/actions/runs/39960814381.
- Web/Linux: análise sem apontamentos, 117 testes aprovados e compilação Web concluída.
- Android/Linux: análise sem apontamentos, 117 testes aprovados e APK debug compilado (`build/app/outputs/flutter-apk/app-debug.apk`).
- iOS/macOS: análise sem apontamentos, 117 testes aprovados e compilação para simulador iOS concluída, sem assinatura de distribuição.

A primeira rodada identificou um erro de sintaxe e a segunda, quatro apontamentos de estilo; ambos foram corrigidos. A rodada funcional seguinte passou em 111 testes e encontrou duas falhas: excesso de altura em 320 px e aviso de conclusão cobrindo a restauração. Corrigidos esses problemas, os 113 testes passaram; a ampliação para cinco tamanhos levou a suíte a 117 testes aprovados nos executores Linux. Não foram enfraquecidas as asserções para ocultar essas falhas.

Os testes de widgets usam serviços simulados. Não comprovam GPS físico, navegação em aparelho real, pagamentos reais nem fidelidade visual integral às referências. Não foi instalado/distribuído APK, emitido IPA assinado, publicado Web na VPS ou feito merge. A gravação final deste relatório é documental e não altera a revisão de aplicação testada.

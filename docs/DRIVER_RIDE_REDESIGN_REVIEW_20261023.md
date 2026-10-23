# Revisão do redesign do Motorista — 23/10/2026

Status: implementação em DRAFT; homologação visual e funcional pendente.

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

O quadro limita a largura a 480 px e a altura ao espaço útil do mapa. Informações secundárias têm rolagem interna, enquanto indicador e ações ficam fora da rolagem. As áreas seguras e a barra inferior foram preservadas. Essas medidas ainda exigem revisão em telas pequenas, navegador móvel e texto ampliado.

## Testes e plataformas

Verificação local: `git diff --check`. Flutter/Dart não estão instalados localmente; não atribuir aprovação a testes ou builds locais.

Testes preparados:

- `driver_flow_test.dart`: minimização/restauração de oferta, deslocamento, viagem e resumo; navegação externa; início; somente uma conclusão financeira; preservação de Atividade; fluxo em tela de 320 x 640.
- `realtime_offer_test.dart`: mudança de etapa minimizada, restauração atualizada, retirada da representação encerrada e nova corrida sem cartão obsoleto.

O workflow `driver-ride-redesign-review.yml` executa análise, testes e builds Web, APK debug e iOS simulador, sem deploy e sem acesso a segredos de produção. Resultados reais devem ser registrados após a execução. Código compartilhado alcança Web/Android/iOS, mas não comprova homologação nessas plataformas.

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

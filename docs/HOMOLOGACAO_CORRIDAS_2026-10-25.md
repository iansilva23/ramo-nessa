# Homologação de corridas — preparação

Código funcional validado: 3c5fa5e5; dez jobs aprovados na execução 40232751441. O commit d33b75ec acrescenta somente o relatório. PR #72 permanece DRAFT. Não houve publicação ou ativação.

## Baseline atual

Executar inspect-ride-consistency.mjs somente leitura na VPS. Registrar imagens Core/gateway, caminho Web, migrações e políticas. O diagnóstico agora inclui B/C e contagens agregadas, sem relatos pessoais. `table_absent` em B/C significa que a estrutura ainda não está instalada; não significa configuração falsa. Comparar com a evidência anterior: migração 095, Web driver-cinema-d8ddfb102f88, embarque e cancelamento manual desligados. Não executar instaladores dos PRs #62/#69 sobre versões novas sem verificar compatibilidade.

## Ambiente de teste necessário

Antes de testes com recursos ativados, preparar ambiente separado com banco próprio e contas de teste, sem usuários, dinheiro ou credenciais de produção. Preservar os controles da VPS. Usar o código validado, aplicar migrações em banco de homologação e comprovar A/B/C desligados. Os builds do CI usam example.invalid, sem credenciais reais: não são pacotes para instalar em aparelhos. Android físico exige build de homologação configurado; iPhone físico exige assinatura/perfil e distribuição de teste apropriados. Não tratar WebKit como teste em iPhone.

## Sequência e evidências

| Cenário | Resultado esperado | Evidência a registrar |
|---|---|---|
| A/B/C desligados | Fluxo anterior preservado; atualização não ativa recursos | Configuração antes/depois e IDs de teste |
| Dinheiro cancelado pelo motorista | Histórico identifica cancelamento; sem cobrança digital | Mesmo ID no backend e nas telas |
| Checkout vencido sem pagamento | Solicitação expirada, sem botão de pagar | Estado exibido e ausência de pagamento |
| Fechar/reabrir Web e aparelhos | Início acessível; retomada por Atividades sem ação financeira | ID da corrida/pagamento antes/depois |
| Ativar somente A em homologação | Código de três dígitos; bloqueio após cinco erros | Tentativas persistidas, retomada e liberação pelo suporte |
| Ativar somente B em homologação | Opções de interrupção e suporte vinculados | Duas versões e um atendimento |
| Pix mecânico / continuar | Mesma corrida, destino e pagamento; substituto por ETA | Ofertas de 35s, GPS do substituto e zero ao primeiro motorista |
| A+B / substituição | Novo código de três dígitos; anterior rejeitado | Histórico de embarques e cinco tentativas independentes |
| Ninguém aceita / GPS indisponível | Devolução ou suporte; sem localização/ETA inventados | Estado real e ausência de nova cobrança |
| Devolução Pix | Somente confirmação financeira encerra devolução | ID da operação e resposta do provedor |
| Dinheiro interrompido | Recebimento/devolução físicos, confirmação ou contestação | Relatos e decisão ADM; nenhuma transferência automática |
| Contestar encerramento | Nenhuma sanção automática pela acusação | Relatos das duas partes e decisão justificada |
| C em homologação / próxima Pix | Bônus separado ao prejudicado; comissão só sobre tarifa normal | Total, ledger, destinatários e retry idempotente |
| C em homologação / próxima dinheiro | Bônus físico integral ao próximo motorista | Valor a receber e comissão normal, sem crédito digital fictício |
| Próxima cancelada/reembolsada | Sem cobrança/compensação duplicada | Reserva liberada ou revisão após liquidação |
| Internet cai antes/depois da confirmação | Retomar estado persistido sem repetir operação | Mesmos IDs e referências únicas no ledger |

Após cada grupo, desligar explicitamente as políticas do ambiente de teste e verificar persistência. Alterar controles não muda regras de corridas já iniciadas; criar novas corridas para cada combinação. Operações sandbox devem ser rotuladas como simuladas. Antes de qualquer teste financeiro real, preparar caso concreto com valor, contas, provedor, efeito esperado e autorização correspondente. Nenhuma evidência automatizada substitui a confirmação bancária real.

## Bloqueios atuais

Sem sessão SSH disponível nesta execução; a leitura da VPS depende da saída do diagnóstico executado pelo responsável. Ainda não foram identificados ambiente separado, domínio de homologação, distribuição para aparelhos ou credenciais de teste. Não criar esses valores por suposição. A próxima decisão de pacote depende dessa baseline; este documento não autoriza instalar ou ativar recursos na VPS.
